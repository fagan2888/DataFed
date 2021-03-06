#include "unistd.h"
#include "DynaLog.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"
#include "TaskWorker.hpp"

using namespace std;

//#define TASK_DELAY sleep(60);
#define TASK_DELAY

namespace SDMS {
namespace Core {

TaskWorker::TaskWorker( ITaskMgr & a_mgr, uint32_t a_worker_id ) :
    ITaskWorker( a_worker_id ),
    m_mgr( a_mgr ),
    m_thread( 0 ),
    m_db( Config::getInstance().db_url , Config::getInstance().db_user, Config::getInstance().db_pass )
{
    m_thread = new thread( &TaskWorker::workerThread, this );
}

TaskWorker::~TaskWorker()
{
}


void
TaskWorker::workerThread()
{
    bool                        retry = false;
    string                      err_msg;
    libjson::Value              task_cmd;
    libjson::Value::ObjectIter  iter;
    uint32_t                    cmd;
    int                         step;
    bool                        first;

    DL_DEBUG( "Task worker " << id() << " started." )

    while( 1 )
    {
        m_task = m_mgr.getNextTask( this );

        DL_DEBUG("Task worker " << id() << " handling new task " << m_task->task_id );

        err_msg.clear();
        first = true;

        while ( true )
        {
            try
            {
                if ( first ){
                    DL_DEBUG( "Calling task run (first)" );
                    m_db.taskRun( m_task->task_id, task_cmd, 0 );
                    first = false;
                }
                else
                {
                    DL_DEBUG( "Calling task run, step: " << step );
                    m_db.taskRun( m_task->task_id, task_cmd, err_msg.size()?0:&step, err_msg.size()?&err_msg:0 );
                }

                DL_DEBUG( "task reply: " << task_cmd.toString() );

                iter = task_cmd.find("cmd");
                if ( iter == task_cmd.end() )
                    EXCEPT(1,"Reply missing command value" );

                if ( !iter->second.isNumber() )
                    EXCEPT(1,"Reply command value has invalid type" );
                cmd = (uint32_t)iter->second.asNumber();

                iter = task_cmd.find("params");
                if ( iter == task_cmd.end() )
                    EXCEPT(1,"Reply missing params value" );

                libjson::Value & params = iter->second;

                iter = task_cmd.find("step");
                if ( iter != task_cmd.end() )
                    step = iter->second.asNumber();
                else if ( cmd != TC_STOP )
                    EXCEPT(1,"Reply missing step value" );

                switch ( cmd )
                {
                case TC_RAW_DATA_TRANSFER:
                    retry = cmdRawDataTransfer( params );
                    break;
                case TC_RAW_DATA_DELETE:
                    retry = cmdRawDataDelete( params );
                    break;
                case TC_RAW_DATA_UPDATE_SIZE:
                    retry = cmdRawDataUpdateSize( params );
                    break;
                case TC_ALLOC_CREATE:
                    retry = cmdAllocCreate( params );
                    break;
                case TC_ALLOC_DELETE:
                    retry = cmdAllocDelete( params );
                    break;
                case TC_STOP:
                    iter = task_cmd.find("new_tasks");
                    if ( iter != task_cmd.end() )
                    {
                        DL_DEBUG("found " << iter->second.size() << " new ready tasks." );
                        m_mgr.newTasks( iter->second );
                    }
                    break;
                default:
                    EXCEPT_PARAM(1,"Invalid task command: " << cmd );
                }
                //DL_DEBUG("sleep");
                //sleep(10);

                if ( cmd == TC_STOP )
                    break;

                if ( retry )
                {
                    if ( m_mgr.retryTask( m_task ))
                    {
                        DL_DEBUG("Task worker " << id() << " aborting task " << m_task->task_id );
                        //abortTask( "Maximum task retry period exceeded." );
                        err_msg = "Maximum task retry period exceeded.";
                    }

                    break;
                }
            }
            catch( TraceException & e )
            {
                err_msg = e.toString();
                DL_ERROR( "Task worker " << id() << " exception: " << err_msg );
                //abortTask( msg );
            }
            catch( exception & e )
            {
                err_msg = e.what();
                DL_ERROR( "Task worker " << id() << " exception: " << err_msg );
                //abortTask( msg );
            }
        }
    }
}


void
TaskWorker::abortTask( const std::string & a_msg )
{
    DL_DEBUG("Task worker " << id() << " aborting task " << m_task->task_id );

    try
    {
        libjson::Value reply;

        m_db.taskAbort( m_task->task_id, a_msg, reply );

        m_mgr.newTasks( reply );
    }
    catch( TraceException & e )
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION: " << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION: " << e.what() );
    }
    catch(...)
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION!");
    }
}


bool
TaskWorker::cmdRawDataTransfer( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataTransfer" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string &                    uid = a_task_params["uid"].asString();
    TaskType                    type = (TaskType)a_task_params["type"].asNumber();
    Encryption                  encrypt = (Encryption)a_task_params["encrypt"].asNumber();
    string &                    src_ep = a_task_params["src_repo_ep"].asString();
    string &                    src_path = a_task_params["src_repo_path"].asString();
    string &                    dst_ep = a_task_params["dst_repo_ep"].asString();
    string &                    dst_path = a_task_params["dst_repo_path"].asString();
    libjson::Value::Array &     files = a_task_params["files"].getArray();
    string                      src_repo_id;
    string                      dst_repo_id;
    bool                        encrypted = true;
    GlobusAPI::EndpointInfo     ep_info;

    switch ( type )
    {
    case TT_DATA_GET:
        src_repo_id = a_task_params["src_repo_id"].asString();
        break;
    case TT_DATA_PUT:
        dst_repo_id = a_task_params["dst_repo_id"].asString();
        break;
    case TT_REC_CHG_ALLOC:
    case TT_REC_CHG_OWNER:
        src_repo_id = a_task_params["src_repo_id"].asString();
        dst_repo_id = a_task_params["dst_repo_id"].asString();
        break;
    default:
        EXCEPT_PARAM( 1, "Invalid task type for raw data transfer command: " << type );
        break;
    }

    string acc_tok = a_task_params["acc_tok"].asString();
    string ref_tok = a_task_params["ref_tok"].asString();
    uint32_t expires_in = a_task_params["acc_tok_exp_in"].asNumber();

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << uid );

        m_glob.refreshAccessToken( ref_tok, acc_tok, expires_in );
        m_db.setClient( uid );
        m_db.userSetAccessToken( acc_tok, expires_in, ref_tok );
    }

    //EXCEPT(1,"TEST ONLY EXCEPTION");

    if ( type == TT_DATA_GET || type == TT_DATA_PUT )
    {
        string & ep = (type == TT_DATA_GET)?dst_ep:src_ep;

        // Check destination endpoint
        m_glob.getEndpointInfo( ep, acc_tok, ep_info );
        if ( !ep_info.activated )
            EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

        // TODO Notify if ep activation expiring soon

        // Calculate encryption state
        encrypted = checkEncryption( ep, encrypt, ep_info );
    }

    // Init Globus transfer
    DL_DEBUG( "Init globus transfer" );

    vector<pair<string,string>> files_v;
    for ( libjson::Value::ArrayIter f = files.begin(); f != files.end(); f++ )
    {
        if ( type == TT_DATA_PUT || (*f)["size"].asNumber() > 0 )
            files_v.push_back(make_pair( src_path + (*f)["from"].asString(), dst_path + (*f)["to"].asString() ));
    }

    if ( files_v.size() )
    {
        DL_DEBUG( "Begin transfer of " << files_v.size() << " files" );

        string glob_task_id = m_glob.transfer( src_ep, dst_ep, files_v, encrypted, acc_tok );

        // Monitor Globus transfer

        GlobusAPI::XfrStatus    xfr_status;
        string                  err_msg;

        do
        {
            sleep( 5 );

            if ( m_glob.checkTransferStatus( glob_task_id, acc_tok, xfr_status, err_msg ))
            {
                // Transfer task needs to be cancelled
                m_glob.cancelTask( glob_task_id, acc_tok );
            }
        } while( xfr_status < GlobusAPI::XS_SUCCEEDED );

        if ( xfr_status == GlobusAPI::XS_FAILED )
            EXCEPT( 1, err_msg );
    }else
    {
        DL_DEBUG( "No files to transfer" );
    }

    return false;
}


bool
TaskWorker::cmdRawDataDelete( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataDelete" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    Auth::RepoDataDeleteRequest     del_req;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;
    //time_t                          mod_time;
    const string &                  repo_id = a_task_params["repo_id"].asString();
    const string &                  path = a_task_params["repo_path"].asString();
    libjson::Value::Array &         ids = a_task_params["ids"].getArray();
    libjson::Value::ArrayIter       id;

    for ( id = ids.begin(); id != ids.end(); id++ )
    {
        loc = del_req.add_loc();
        loc->set_id( id->asString() );
        loc->set_path( path + id->asString().substr(2) );
    }

    if ( repoSendRecv( repo_id, del_req, reply ))
        return true;

    delete reply;

    return false;
}


bool
TaskWorker::cmdRawDataUpdateSize( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataUpdateSize" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    const string &                  repo_id = a_task_params["repo_id"].asString();
    const string &                  path = a_task_params["repo_path"].asString();
    libjson::Value::Array &         ids = a_task_params["ids"].getArray();
    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;

    for ( libjson::Value::ArrayIter id = ids.begin(); id != ids.end(); id++ )
    {
        loc = sz_req.add_loc();
        loc->set_id( id->asString() );
        loc->set_path( path + id->asString().substr(2) );
    }

    if ( repoSendRecv( repo_id, sz_req, reply ))
        return true;

    if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( reply )) != 0 )
    {
        if ( sz_rep->size_size() != (int)ids.size() )
            EXCEPT_PARAM( 1, "Mismatched result size with RepoDataSizeReply from repo: " << repo_id );

        m_db.recordUpdateSize( *sz_rep );

        delete reply;
    }
    else
    {
        delete reply;
        EXCEPT_PARAM( 1, "Unexpected reply to RepoDataSizeReply from repo: " << repo_id );
    }

    return false;
}


bool
TaskWorker::cmdAllocCreate( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdAllocCreate" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string & repo_id = a_task_params["repo_id"].asString();
    string & path = a_task_params["repo_path"].asString();

    Auth::RepoPathCreateRequest     req;
    MsgBuf::Message *               reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
}


bool
TaskWorker::cmdAllocDelete( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdAllocDelete" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string & repo_id = a_task_params["repo_id"].asString();
    string & path = a_task_params["repo_path"].asString();

    Auth::RepoPathDeleteRequest         req;
    MsgBuf::Message *                   reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
}


bool
TaskWorker::checkEncryption( const std::string & a_ep, Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info.force_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep << " requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep << " does not support encryption.");
            return true;
        default:
            EXCEPT_PARAM( 1, "Invalid transfer encryption value: " << a_encrypt );
    }

    // compiler warns, but can't get here
    return false;
}


bool
TaskWorker::repoSendRecv( const string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply )
{
    Config & config = Config::getInstance();

    map<string,RepoData*>::iterator rd = config.repos.find( a_repo_id );
    if ( rd == config.repos.end() )
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &config.sec_ctx );

    comm.send( a_msg );

    MsgBuf buffer;

    if ( !comm.recv( buffer, false, 10000 ))
    {
        DL_ERROR( "Timeout waiting for size response from repo " << a_repo_id );
        cerr.flush();
        return true;
    }
    else
    {
        // Check for NACK
        a_reply = buffer.unserialize();

        Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( a_reply );
        if ( nack != 0 )
        {
            ErrorCode code = nack->err_code();
            string  msg = nack->has_err_msg()?nack->err_msg():"Unknown service error";

            delete a_reply;

            EXCEPT( code, msg );
        }

        return false;
    }
}

/*
bool
TaskWorker::refreshDataSize( const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext )
{
    time_t mod_time = time(0);
    size_t file_size = 1;

    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               raw_msg;

    loc = sz_req.add_loc();
    loc->set_id( a_data_id );
    loc->set_path( a_data_path );

    DL_INFO( "SendRecv msg to " << a_repo_id );

    if ( repoSendRecv( a_repo_id, sz_req, raw_msg ))
    {
        DL_INFO( "SendRecv failed, must retry" );

        return true;
    }

    DL_INFO( "SendRecv OK" );

    if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
    {
        if ( sz_rep->size_size() == 1 )
            file_size = sz_rep->size(0).size();

        delete raw_msg;
    }
    else
    {
        delete raw_msg;
        EXCEPT_PARAM( 1, "Unexpected reply type from repo service: " << a_repo_id );
    }


    // Update DB record with new file stats
    m_db.recordUpdatePostPut( a_data_id, file_size, mod_time, a_src_path, a_ext.isString()?&a_ext.asString():0 );

    return false;
}
*/

}}
