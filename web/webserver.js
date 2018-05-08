/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */
/* globals process */
/* globals Buffer */
/* globals __dirname */

/*import { isContext } from 'vm';*/

'use strict';

const express = require('express');
var cookieParser = require('cookie-parser');
var https = require('https');
var request = require('request');
const fs = require('fs');
var protobuf = require("protobufjs");
var zmq = require("zeromq");
const app = express();
var ECT = require('ect');
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });
const port = 443;

var server_key = process.env.SDMS_WEB_KEY || 'sdms_web_key.pem';
var server_cert = process.env.SDMS_WEB_CERT || 'sdms_web_cert.pem';

var privateKey  = fs.readFileSync( server_key, 'utf8');
var certificate = fs.readFileSync( server_cert, 'utf8');
var web_credentials = {key: privateKey, cert: certificate};
var jwt_decode = require('jwt-decode');
var g_anon;
var g_auth;
var g_msg_by_id = {};
var g_msg_by_name = {};

const oauth_credentials = {
    clientId: '7bc68d7b-4ad4-4991-8a49-ecbfcae1a454',
    clientSecret: 'FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=',
    authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
    accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
    redirectUri: 'https://sdms.ornl.gov:443/user_auth',
    scopes: ['openid']
};

// Initialize the OAuth2 Library
const ClientOAuth2 = require('client-oauth2');
var globus_auth = new ClientOAuth2( oauth_credentials );

//--- This is a HACK to gt around lack of host cert
var agentOptions;
var agent;

agentOptions = {
    host : 'sdms.ornl.gov',
    port : '443',
    path : '/',
    rejectUnauthorized : false
};

agent = new https.Agent(agentOptions);

const MAX_CTX = 50;
var g_ctx = new Array( MAX_CTX );
g_ctx.fill(null);
var g_ctx_next = 0;

const nullfr = Buffer.from([]);
var core_sock = zmq.socket('dealer');
core_sock.connect('tcp://sdms.ornl.gov:9001');
console.log('Worker connected to port 3000');

app.use( express.static( __dirname + '/static' ));
app.use( cookieParser() );
app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("get /");

    response.render('index');
});

app.get('/main', (request, response) => {
    console.log("get /main");

    response.render( 'main', { user: request.cookies['sdms-user'] });
});

app.get('/register', (request, response) => {
    console.log("get /register");

    response.render('register');
});

app.get('/login', (request, response) => {
    console.log("get /login");

    var uri = globus_auth.code.getUri();
    console.log( 'about to go to', uri );
    response.redirect(uri);
});

app.get('/error', (request, response) => {
    console.log("get /error");

    response.render('error');
});

app.get('/user_auth', ( a_request, a_response ) => {
    console.log( 'get /user_auth', a_request.originalUrl );

    // TODO Need to understand error flow here - there doesn't seem to be anhy error handling

    globus_auth.code.getToken( a_request.originalUrl + "&access_type=offline" ).then( function( client_token ) {
        console.log( 'client token:', client_token );

        // TODO - Refresh the current users access token?
        /*
        client_token.refresh().then( function( updatedUser ) {
            // TODO What to do here???
            console.log( updatedUser !== client_token ); //=> true
            console.log( updatedUser.accessToken );
        }, function( reason ) {
            console.log( "refresh failed:", reason );
        }); */

        request.post({
            uri: 'https://auth.globus.org/v2/oauth2/token/introspect',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Accept' : 'application/json',
            },
            auth: {
                user: oauth_credentials.clientId,
                pass: oauth_credentials.clientSecret
            },
            body: 'token=' + client_token.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
            var userinfo = null;

            if ( response.statusCode >= 200 && response.statusCode < 300 ) {
                //console.log( 'got user info:', body );
                userinfo = JSON.parse( body );

                // Set access token cookie even if user isn't registered
                a_response.cookie( 'sdms-token', client_token.accessToken, { httpOnly: true });

                request.get({
                    uri: 'https://sdms.ornl.gov/usr/find',
                    qs: { uuids: userinfo.identities_set },
                    agent: agent // HACK
                }, function( error, response, body ) {
                    console.log( '/usr/find cb' );
                    if ( error ) {
                        console.log( '/usr/find error:', error );
                        a_response.redirect( "/error" );
                    } else {
                        if ( response.statusCode == 200 ) {
                            console.log( 'user found:', body );
                            // TODO Account may be disable from SDMS (active = false)
                            userinfo.registered = true;
                            userinfo.active = true;
                            a_response.cookie( 'sdms-user', JSON.stringify( userinfo ));
                            a_response.redirect( "main" );
                        } else {
                            console.log( 'user not registered' );
                            userinfo.registered = false;
                            userinfo.active = false;
                            a_response.cookie( 'sdms-user', JSON.stringify( userinfo ));
                            a_response.redirect( "register" );
                        }
                    }
                });

            } else {
                a_response.clearCookie( 'sdms-token' );
                a_response.clearCookie( 'sdms-user' );
                a_response.redirect( "/error" );
            }
        } );
    }, function( reason ){
        console.log( "getToken failed:", reason );
    });
});

app.get('/usr/register', ( a_request, a_response ) => {
    var user = JSON.parse( a_request.cookies[ 'sdms-user' ] );
    console.log( 'get /usr/register', user );

    allocRequestContext( a_response, function( ctx ){
        var uid = user.username.substr( 0, user.username.indexOf( "@" ));
        console.log( "create", { uid: uid, password: a_request.query.pw, name: user.name, email: user.email, uuid: user.identities_set } );
        var msg = g_msg_by_name["UserCreateRequest"];
        console.log( typeof uid, typeof a_request.query.pw, typeof user.name, typeof user.email );
        var msg_buf = msg.encode({ uid: uid, password: a_request.query.pw, name: user.name, email: user.email, uuid: user.identities_set }).finish();
        console.log("frame");
        var frame = Buffer.alloc(8);
        frame.writeUInt32LE( msg_buf.length, 0 );
        frame.writeUInt8( msg._pid, 4 );
        frame.writeUInt8( msg._mid, 5 );
        frame.writeUInt16LE( ctx, 6 );

        g_ctx[ctx] = function( reply ){
            console.log( "reply to /usr/register", reply );
            if ( reply.errCode ) {
                // TODO Need to provide error information as query string
                a_response.redirect( "error" );
            } else {
                user.registered = true;
                user.active = true;
                a_response.cookie( 'sdms-user', JSON.stringify( user ));
                a_response.redirect( "main" );
            }
        };

        console.log("frame buffer", frame.toString('hex'));
        console.log("msg buffer", msg_buf.toString('hex'));

        core_sock.send([ nullfr, frame, msg_buf ]);
    });
});

app.get('/usr/find', ( a_request, a_response ) => {
    console.log("get /usr/find");

    allocRequestContext( a_response, function( ctx ){
        var msg = g_msg_by_name["UserFindByUUIDsRequest"];
        var msg_buf = msg.encode({ uuid: a_request.query.uuids }).finish();
        console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );

        /* Frame contents (C++)
        uint32_t    size;       // Size of buffer
        uint8_t     proto_id;
        uint8_t     msg_id;
        uint16_t    isContext
        */
        var frame = Buffer.alloc(8);
        frame.writeUInt32LE( msg_buf.length, 0 );
        frame.writeUInt8( msg._pid, 4 );
        frame.writeUInt8( msg._mid, 5 );
        frame.writeUInt16LE( ctx, 6 );

        g_ctx[ctx] = function( reply ){
            console.log( "reply to /usr/find", reply );
            if ( reply.errCode ) {
                a_response.status( 404 );
                if ( reply.errMsg )
                    a_response.send( reply.errMsg );
                else
                    a_response.send( "User not found" );
            } else {
                var user = reply.user[0];
                a_response.send({ name: user.name, uid: user.uid });
            }
        };

        //console.log("frame buffer", frame.toString('hex'));
        //console.log("msg buffer", msg_buf.toString('hex'));

        core_sock.send([ nullfr, frame, msg_buf ]);
    });
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

protobuf.load("SDMS_Anon.proto", function(err, root) {
    if ( err )
        throw err;

    g_anon = root;

    console.log('anon protobuf loaded');

    var msg = root.lookupEnum( "SDMS.Anon.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Anon proto file";
    
    var mlist = msg.parent.order;
    var pid = msg.values.ID;

    for ( var i = 0; i < mlist.length - 1; i++ ) {
        msg = mlist[i+1];

        msg._pid = pid;
        msg._mid = i;
        msg._msg_type = (pid << 8) | i;

        console.log( "msg", msg._msg_type, msg.name );

        g_msg_by_id[ msg._msg_type ] = msg;
        g_msg_by_name[ msg.name ] = msg;
    }
});

protobuf.load("SDMS_Auth.proto", function(err, root) {
    if ( err )
        throw err;

    g_auth = root;

    console.log('auth protobuf loaded');

    var msg = root.lookupEnum( "SDMS.Auth.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Auth proto file";
    
    var mlist = msg.parent.order;
    var pid = msg.values.ID;
    // Skip first entry which is Protocol enum
    for ( var i = 0; i < mlist.length-1; i++ ) {
        msg = mlist[i+1];

        msg._pid = pid;
        msg._mid = i;
        msg._msg_type = (pid << 8) | i;

        console.log( "msg", msg._msg_type, msg.name );

        g_msg_by_id[ msg._msg_type ] = msg;
        g_msg_by_name[ msg.name ] = msg;
    }

    // Test
    /*
    var msg = g_proto[pro.values.ID][1];
    if ( msg )
        console.log( "msg[1]:", msg.name );
    else
        console.log( "msg[1] not found!" );
    */
});


core_sock.on('message', function( delim, frame, msg_buf ) {
    console.log( "got msg", delim, frame, msg_buf );
    console.log( "frame", frame.toString('hex') );
    var mlen = frame.readUInt32LE( 0 );
    var mtype = (frame.readUInt8( 4 ) << 8 ) | frame.readUInt8( 5 );
    var ctx = frame.readUInt16LE( 6 );

    console.log( "len", mlen, "mtype", mtype, "ctx", ctx );

    var msg_class = g_msg_by_id[mtype];
    var msg;

    if ( msg_class ) {
        msg = msg_class.decode( msg_buf );
        if ( !msg )
            console.log( "decode failed" );
    } else {
        console.log( "unkown mtype" );
    }

    var f = g_ctx[ctx];
    if ( f ) {
        g_ctx[ctx] = null;
        g_ctx_next = ctx;
        f( msg );
    } else {
        console.log( "no callback found!" );
    }
});

function allocRequestContext( a_response, a_callback ) {
    var ctx = g_ctx_next;
    if ( ctx == MAX_CTX ) {
        ctx = g_ctx.indexOf( null );
        if ( ctx == -1 ) {
            a_response.status( 503 );
            a_response.send( "Server too busy" );
        } else {
            a_callback( ctx );
        }
    } else if ( ++g_ctx_next < MAX_CTX ) {
        if ( g_ctx[g_ctx_next] )
            g_ctx_next = MAX_CTX;
        a_callback( ctx );
    }
};

var httpsServer = https.createServer( web_credentials, app );

console.log( "listeing on port", port );

httpsServer.listen( port );
