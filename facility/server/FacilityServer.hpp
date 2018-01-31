#ifndef SDMSCLIENT_HPP
#define SDMSCLIENT_HPP

#include <thread>
#include <mutex>
#include <condition_variable>
#include <vector>

#include <stdint.h>
#include <time.h>
//#include <gssapi.h>

#include <Connection.hpp>
#include "Facility.pb.h"
#include "Repository.pb.h"

namespace SDMS {
namespace Facility {

class Server
{
public:
    Server( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout = 30, uint32_t a_num_workers = 0 );
    ~Server();

    void    runWorkerRouter( bool a_async );
    void    stopWorkerRouter( bool a_async );
    void    waitWorkerRouter();

private:

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

    void            backgroundMaintenance();
    //ClientInfo &    getClientInfo( MsgBuffer &a_msg_buffer, bool a_upd_last_act = false );


    void    procMsgStatus( MsgBuffer &a_msg_buffer );
    void    procMsgPing( MsgBuffer &a_msg_buffer );

    typedef void (Server::*msg_fun_t)( MsgBuf& );

    uint32_t                        m_timeout;
    std::thread   *                 m_maint_thread;
    uint32_t                        m_num_workers;
    std::mutex                      m_api_mutex;
    std::mutex                      m_data_mutex;
    bool                            m_router_running;
    bool                            m_worker_running;
    std::condition_variable         m_router_cvar;
    //std::map<uint32_t,ClientInfo>   m_client_info;
    //gss_cred_id_t                   m_sec_cred;
    std::map<uint16_t,msg_fun_t>    m_msg_handlers;
    
    friend class Worker;
};


}}

#endif
