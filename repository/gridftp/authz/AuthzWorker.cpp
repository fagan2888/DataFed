#include <string>
#include <fstream>
#include <cstdlib>

#include "MsgBuf.hpp"
#include "MsgComm.hpp"
#include "Util.hpp"
#define DEF_DYNALOG
#include "DynaLog.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "Version.pb.h"

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;


namespace SDMS
{

class AuthzWorker
{
public:
    AuthzWorker() : m_timeout( 10000 )
    {
        const char * cfg_file = getenv( "DATAFED_AUTHZ_CFG_FILE" );

        if ( !cfg_file )
            EXCEPT( 1, "DATAFED_AUTHZ_CFG_FILE environment variable not set." );

        DL_INFO( "Reading config file: " << cfg_file );

        ifstream configFile(cfg_file);

        if ( !configFile.is_open() )
            EXCEPT_PARAM( 1, "Could not open authz config file: " << cfg_file );

        string line,key,val;
        size_t eq, lc = 0;

        while( getline( configFile, line ))
        {
            lc++;

            if ( line.length() == 0 || line.at(0) == '#')
                continue;

            eq = line.find_first_of("=");

            if ( eq == string::npos )
                EXCEPT_PARAM( 1, "Invalid syntax in config file at line " << lc );

            key = line.substr(0,eq);
            val = line.substr(eq+1);

            if (key == "repo_id")
                m_repo_id = val;
            else if (key == "server_address")
                m_server_addr = val;
            else if (key == "pub_key")
                m_pub_key = loadKeyFile( val );
            else if (key == "priv_key")
                m_priv_key = loadKeyFile( val );
            else if (key == "server_key")
                m_server_key = loadKeyFile( val );
            else if (key == "timeout")
                m_timeout = stoi(val);
            else if (key == "test_path" )
                m_test_path = val;
            else
                EXCEPT_PARAM( 1, "Invalid key \"" << key << "\"in config file at line " << lc );
        }

        configFile.close();

        string miss;

        if ( !m_repo_id.size() )
            miss += " repo_id";
        if ( !m_server_addr.size() )
            miss += " server_address";
        if ( !m_pub_key.size() )
            miss += " pub_key";
        if ( !m_priv_key.size() )
            miss += " priv_key";
        if ( !m_server_key.size() )
            miss += " server_key";

        if ( miss.size() )
            EXCEPT_PARAM( 1, "Missing required configuration items:" << miss );

        REG_PROTO( SDMS::Anon );
        REG_PROTO( SDMS::Auth );
    }

    ~AuthzWorker()
    {
    }

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int checkAuth( char * client_id, char * path, char * action )
    {
        DL_DEBUG("Checking auth for " << client_id << " in " << path );

        if ( m_test_path.size() > 0 && strncmp( path, m_test_path.c_str(), m_test_path.size() ) == 0 )
        {
            DL_INFO("Allowing request within TEST PATH");
            return 0;
        }

        int result = 1;

        MsgComm::SecurityContext sec_ctx;
        sec_ctx.is_server = false;
        sec_ctx.public_key = m_pub_key;
        sec_ctx.private_key = m_priv_key;
        sec_ctx.server_key = m_server_key;
        
        Auth::RepoAuthzRequest  auth_req;
        MsgBuf::Message *       reply;
        MsgBuf::Frame           frame;

        MsgComm authzcomm(m_server_addr, MsgComm::DEALER, false, &sec_ctx );

        auth_req.set_repo(m_repo_id);
        auth_req.set_client(client_id);
        auth_req.set_file(path);
        auth_req.set_action(action);
        
        authzcomm.send(auth_req);

        if ( !authzcomm.recv( reply, frame, m_timeout ))
        {
            EXCEPT(1,"Core service did no respond");
        }
        else
        {
            DL_DEBUG( "Got response, msg type: " << frame.getMsgType() );

            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
            if ( !nack )
            {
                result = 0;
            }
            else
            {
                DL_DEBUG("Got NACK reply");
            }

            delete reply;
        }
        return result;
    }

private:
    string loadKeyFile( const std::string & filename )
    {
        ifstream inf( filename.c_str() );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT_PARAM( 1, "Could not open file: " << filename );
        string key;
        inf >> key;
        inf.close();
        return key;
    }


    std::string                     m_pub_key;
    std::string                     m_priv_key;
    std::string                     m_server_key;
    std::string                     m_repo_id;
    std::string                     m_server_addr;
    std::string                     m_test_path;
    uint32_t                        m_timeout;
};

} // End namespace SDMS


extern "C"
{
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MINOR) + "." + std::to_string(VER_BUILD);

        return ver_str.c_str();
    }

    int checkAuthorization( char * client_id, char * object, char * action )
    {
        DL_SET_LEVEL( DynaLog::DL_INFO_LEV );
        DL_SET_CERR_ENABLED(false);
        DL_SET_SYSDL_ENABLED(true);

        DL_DEBUG( "AuthzWorker checkAuthorization " << client_id << ", " << object << ", " << action );

        int result = -1;

        try
        {
            SDMS::AuthzWorker worker;
            result = worker.checkAuth( client_id, object, action );
        }
        catch( TraceException &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.toString() );
        }
        catch( exception &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.what() );
        }

        return result;
    }
}

