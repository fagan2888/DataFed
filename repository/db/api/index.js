/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

require("@arangodb/aql/cache").properties({ mode: "demand" });

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();

router.use( "/usr", require('./user_router') );
router.use( "/grp", require('./group_router') );
router.use( "/dat", require('./data_router') );
router.use( "/col", require('./coll_router') );
router.use( "/acl", require('./acl_router') );
router.use( "/tag", require('./tag_router') );
router.use( "/not", require('./note_router') );
router.use( "/xfr", require('./xfr_router') );
router.use( "/authz", require('./authz_router') );

module.context.use(router);

        
