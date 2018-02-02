#include <iostream>
#include <algorithm>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <condition_variable>

#include "unistd.h"
#include "sys/types.h"

#include <asio.hpp>
#include <asio/ssl.hpp>

#include "MsgBuf.hpp"
#include "DynaLog.hpp"
#include "FacilityServer.hpp"
#include "SDMS.pb.h"
#include "Facility.pb.h"
//#include "GSSAPI_Utils.hpp"

using namespace std;

namespace SDMS {
namespace Facility {

#define DEBUG_GSI
#define MAINT_POLL_INTERVAL 5
#define CLIENT_IDLE_TIMEOUT 30
#define SET_MSG_HANDLER(proto_id,name,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, name )] = func


class ServerImpl
{
public:
    ServerImpl( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, uint32_t a_num_threads ) :
        m_host( a_host ),
        m_port( a_port ),
        m_timeout(a_timeout),
        m_io_thread(0),
        m_maint_thread(0),
        m_num_threads(a_num_threads),
        m_io_running(false),
        m_endpoint( asio::ip::tcp::v4(), m_port ),
        m_acceptor( m_io_service, m_endpoint ),
        m_socket( m_io_service )
    {
        uint8_t proto_id = REG_PROTO( SDMS );
        SET_MSG_HANDLER( proto_id, "StatusRequest", &ServerImpl::Session::procMsgStatus );
        SET_MSG_HANDLER( proto_id, "PingRequest", &ServerImpl::Session::procMsgPing );

        proto_id = REG_PROTO( Facility );
        (void)proto_id;
        //SET_MSG_HANDLER(proto_id,"InitSecurityRequest",&Worker::procMsgInitSec);
        //SET_MSG_HANDLER(proto_id,"TermSecurityRequest",&Worker::procMsgTermSec);
        //SET_MSG_HANDLER(proto_id,"UserListRequest",&Worker::procMsgUserListReq);
    }


    ~ServerImpl()
    {
    }


    void run( bool a_async )
    {
        unique_lock<mutex> lock(m_api_mutex);

        if ( m_io_running )
            throw runtime_error( "Only one worker router instance allowed" );

        m_io_running = true;

        if ( a_async )
        {
            m_io_thread = new thread( &ServerImpl::ioRun, this );
            m_maint_thread = new thread( &ServerImpl::backgroundMaintenance, this );
        }
        else
        {
            lock.unlock();
            m_maint_thread = new thread( &ServerImpl::backgroundMaintenance, this );
            ioRun();
            lock.lock();
            m_io_running = false;
            m_router_cvar.notify_all();

            m_maint_thread->join();
            delete m_maint_thread;
            m_maint_thread = 0;
        }
    }


    void stop( bool a_wait )
    {
        unique_lock<mutex> lock(m_api_mutex);

        if ( m_io_running )
        {
            // Signal ioPump to stop
            m_io_service.stop();

            if ( a_wait )
            {
                if ( m_io_thread )
                {
                    m_io_thread->join();
                    delete m_io_thread;

                    m_io_thread = 0;
                    m_io_running = false;
                }
                else
                {
                    while( m_io_running )
                        m_router_cvar.wait( lock );
                }

                m_maint_thread->join();
                delete m_maint_thread;
                m_maint_thread = 0;
            }
        }
    }


    void wait()
    {
        unique_lock<mutex> lock(m_api_mutex);

        if ( m_io_running )
        {
            if ( m_io_thread )
            {
                m_io_thread->join();
                delete m_io_thread;

                m_io_thread = 0;
                m_io_running = false;

                m_maint_thread->join();
                delete m_maint_thread;
                m_maint_thread = 0;
            }
            else
            {
                while( m_io_running )
                    m_router_cvar.wait( lock );
            }
        }
    }

private:
    void ioRun()
    {
        cout << "io thread started\n";

        if ( m_io_service.stopped() )
            m_io_service.reset();
        
        if ( m_num_threads == 0 )
            m_num_threads = max( 1u, std::thread::hardware_concurrency() - 1 );

        accept();

        vector<thread*> io_threads;

        for ( uint32_t i = m_num_threads - 1; i > 0; i-- )
        {
            io_threads.push_back( new thread( [this](){ m_io_service.run(); } ));
            cout << "io extra thread started\n";
        }

        m_io_service.run();

        for ( vector<thread*>::iterator t = io_threads.begin(); t != io_threads.end(); ++t )
        {
            (*t)->join();
            delete *t;
            cout << "io extra thread stopped\n";
        }
        cout << "io thread stopped\n";
    }

    void accept()
    {
        m_acceptor.async_accept( m_socket, [this]( error_code ec )
        {
            if ( !ec )
            {
                cout << "connect!\n";
                Session *session = new Session( *this, move( m_socket ));
                session->start();
                m_sessions.push_back( session );
            }

            accept();
        });
    }

    void backgroundMaintenance()
    {
        cout << "maint thread started\n";
        //struct timespec t;
        //map<uint32_t,ClientInfo>::iterator ci;

        while( m_io_running )
        {
            sleep( MAINT_POLL_INTERVAL );

#if 0
            lock_guard<mutex> lock( m_data_mutex );

            clock_gettime( CLOCK_REALTIME, &t );

            for ( ci = m_client_info.begin(); ci != m_client_info.end(); )
            {
                if ( t.tv_sec - ci->second.last_act > CLIENT_IDLE_TIMEOUT )
                {
                    //cout << "clean-up client " << ci->first << "\n";
    #if 0
                    if ( ci->second.sec_ctx )
                    {
                        OM_uint32  min_stat;
                        
                        gss_delete_sec_context( &min_stat, &ci->second.sec_ctx, GSS_C_NO_BUFFER );
                    }
    #endif
                    ci = m_client_info.erase( ci );
                }
                else
                    ++ci;
            }
#endif
        }
        cout << "maint thread stopped\n";
    }


    class Session
    {
    public:
        Session( ServerImpl & a_server, asio::ip::tcp::socket a_socket ) :
            m_server( a_server ),
            m_socket( move( a_socket )),
            m_in_buf( 4096 )
        {
        }

        ~Session()
        {
        }

        void start()
        {
            readMsgHeader();
        }

        void readMsgHeader()
        {
            cout << "Session::readMsgHeader\n";
            asio::async_read( m_socket, asio::buffer( (char*)&m_in_buf.getFrame(), sizeof( MsgBuf::Frame )),
                [this]( error_code ec, size_t len )
                {
                    clock_gettime( CLOCK_REALTIME, &m_last_access );

                    cout << "read hdr cb, len: " << len << "\n";
                    if ( !ec )
                        readMsgBody();
                    else
                    {
                        cerr << ec.message() << "\n";
                        readMsgHeader();
                    }
                });
        }

        void readMsgBody()
        {
            cout << "Session::readMsgBody\n";
            asio::async_read( m_socket, asio::buffer( m_in_buf.getBuffer(), m_in_buf.getFrame().size ),
                [this]( error_code ec, size_t len )
                {
                    cout << "read body cb, len: " << len << "\n";
                    if ( !ec )
                        messageHandler();
                    else
                    {
                        cerr << ec.message() << "\n";
                        readMsgHeader();
                    }
                });
        }

        void messageHandler()
        {
            uint16_t msg_type = m_in_buf.getMsgType();
            map<uint16_t,msg_fun_t>::iterator handler = m_server.m_msg_handlers.find( msg_type );

            if ( handler != m_server.m_msg_handlers.end() )
                (this->*handler->second)();
            else
                cout << "Recv unregistered msg type: " << msg_type << "\n";

            readMsgHeader();
        }



#define PROC_MSG_BEGIN( msgclass, replyclass ) \
    msgclass *msg = 0; \
    ::google::protobuf::Message *base_msg = m_in_buf.unserialize(); \
    if ( base_msg ) \
    { \
        msg = dynamic_cast<msgclass*>( base_msg ); \
        if ( msg ) \
        { \
            DL_TRACE( "Rcvd: " << msg->DebugString()); \
            replyclass reply; \
            try \
            {

#define PROC_MSG_END \
            } \
            catch( TraceException &e ) \
            { \
                DL_WARN( "worker "<<m_id<<": exception:" << e.toString() ); \
                reply.mutable_header()->set_err_code( e.getErrorCode() ); \
                reply.mutable_header()->set_err_msg( e.toString() ); \
            } \
            catch( exception &e ) \
            { \
                DL_WARN( "worker "<<m_id<<": " << e.what() ); \
                reply.mutable_header()->set_err_code( ID_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( e.what() ); \
            } \
            catch(...) \
            { \
                DL_WARN( "worker "<<m_id<<": unkown exception while processing message!" ); \
                reply.mutable_header()->set_err_code( ID_INTERNAL_ERROR ); \
                reply.mutable_header()->set_err_msg( "Unknown exception type" ); \
            } \
            m_out_buf.getFrame().context = m_in_buf.getFrame().context; \
            m_out_buf.serialize( reply ); \
            /*m_conn->send( a_msg_buffer );*/ \
            DL_TRACE( "Sent: " << reply.DebugString()); \
        } \
        else { \
            DL_ERROR( "worker "<<m_id<<": dynamic cast of msg buffer " << &m_in_buf << " failed!" );\
        } \
        delete base_msg; \
    } \
    else { \
        DL_ERROR( "worker "<<m_id<<": buffer parse failed due to unregistered msg type." ); \
    }


        void procMsgStatus()
        {
            PROC_MSG_BEGIN( StatusRequest, StatusReply )

            reply.set_status( NORMAL );

            PROC_MSG_END
        }


        void procMsgPing()
        {
            PROC_MSG_BEGIN( PingRequest, PingReply )

            // Nothing to do

            PROC_MSG_END
        }

        ServerImpl &            m_server;
        asio::ip::tcp::socket   m_socket;
        MsgBuf                  m_in_buf;
        MsgBuf                  m_out_buf;
        struct timespec         m_last_access = {0,0};
    };

    /*void
    Server::procMsgUserListReq( MsgBuffer & a_msg_buffer )
    {
        cout << "proc user list\n";

        PROC_MSG_BEGIN( UserListRequest, UserListReply )

        if ( client.state != CS_AUTHN )
            EXCEPT( ID_SECURITY_REQUIRED, "Method requires authentication" );

        UserData* user;

        user = reply.add_user();
        user->set_uid("jblow");
        user->set_name_last("Blow");
        user->set_name_first("Joe");

        user = reply.add_user();
        user->set_uid("jdoe");
        user->set_name_last("Doe");
        user->set_name_first("John");

        user = reply.add_user();
        user->set_uid("bsmith");
        user->set_name_last("Smith");
        user->set_name_first("Bob");

        PROC_MSG_END
    }*/

    /*
    struct ClientInfo
    {
        ClientInfo() :
            state(CS_INIT), last_act(0) //, sec_ctx(GSS_C_NO_CONTEXT)
        {}

        ClientState     state;
        time_t          last_act;
        //gss_ctx_id_t    sec_ctx;
        std::string     name;
    };
    */



    typedef void (ServerImpl::Session::*msg_fun_t)();

    string                      m_host;
    uint32_t                    m_port;
    uint32_t                    m_timeout;
    thread *                    m_io_thread;
    thread *                    m_maint_thread;
    uint32_t                    m_num_threads;
    mutex                       m_api_mutex;
    mutex                       m_data_mutex;
    bool                        m_io_running;
    condition_variable          m_router_cvar;
    //map<uint32_t,ClientInfo>   m_client_info;
    //gss_cred_id_t                   m_sec_cred;
    map<uint16_t,msg_fun_t>     m_msg_handlers;
    asio::io_service            m_io_service;
    asio::ip::tcp::endpoint     m_endpoint;
    asio::ip::tcp::acceptor     m_acceptor;
    asio::ip::tcp::socket       m_socket;
    vector<Session*>            m_sessions;
    
    friend class Session;
};

// ========== Server Wrapper Class ==========

Server::Server( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, uint32_t a_num_threads )
{
    m_impl = new ServerImpl( a_host, a_port, a_timeout, a_num_threads );
}

Server::~Server()
{
    m_impl->stop( false );
    delete m_impl;
}

void
Server::run( bool a_async )
{
    m_impl->run( a_async );
}

void
Server::stop( bool a_wait )
{
    m_impl->stop( a_wait );
}

void
Server::wait()
{
    m_impl->wait();
}


}}
