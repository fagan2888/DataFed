export const PERM_RD_REC    = 0x0001; // Read record info (description, keywords, details)
export const PERM_RD_META   = 0x0002; // Read structured metadata
export const PERM_RD_DATA   = 0x0004; // Read raw data
export const PERM_WR_REC    = 0x0008; // Write record info (description, keywords, details)
export const PERM_WR_META   = 0x0010; // Write structured metadata
export const PERM_WR_DATA   = 0x0020; // Write raw data
export const PERM_LIST      = 0x0040; // List contents of collection
export const PERM_LINK      = 0x0080; // Link/unlink child records (collections only)
export const PERM_CREATE    = 0x0100; // Create new child records (collections only)
export const PERM_DELETE    = 0x0200; // Delete record
export const PERM_SHARE     = 0x0400; // View/set ACLs
export const PERM_LOCK      = 0x0800; // Lock record
export const PERM_MAX       = 0x0800; // Lock record

export const PERM_BAS_READ       = PERM_RD_REC | PERM_RD_META | PERM_RD_DATA | PERM_LIST;
export const PERM_BAS_WRITE      = PERM_WR_REC | PERM_WR_META | PERM_WR_DATA | PERM_LINK | PERM_CREATE;
export const PERM_BAS_ADMIN      = PERM_DELETE | PERM_SHARE | PERM_LOCK;
export const PERM_ALL            = 0x0FFF;

export const MD_MAX_SIZE                 = 102400; // Max metadata size = 100 Kb
export const PAYLOAD_MAX_SIZE            = 1048576; // Max server payload size = 10 MB

export const SS_USER                     = 1;
export const SS_PROJECT                  = 2;
export const SS_OWNED_PROJECTS           = 3;
export const SS_MANAGED_PROJECTS         = 4;
export const SS_MEMBER_PROJECTS          = 5;
export const SS_COLLECTION               = 6;
export const SS_TOPIC                    = 7;
export const SS_SHARED_BY_USER           = 8;
export const SS_SHARED_BY_ANY_USER       = 9;
export const SS_SHARED_BY_PROJECT        = 10;
export const SS_SHARED_BY_ANY_PROJECT    = 11;
export const SS_VIEW                     = 12;

export const TT_DATA_GET         = 0;
export const TT_DATA_PUT         = 1;
export const TT_DATA_DEL         = 2;
export const TT_REC_CHG_ALLOC    = 3;
export const TT_REC_CHG_OWNER    = 4;
export const TT_REC_DEL          = 5;
export const TT_ALLOC_CREATE     = 6;
export const TT_ALLOC_DEL        = 7;
export const TT_USER_DEL         = 8;
export const TT_PROJ_DEL         = 9;

export const TS_BLOCKED      = 0;
export const TS_READY        = 1;
export const TS_RUNNING      = 2;
export const TS_SUCCEEDED    = 3;
export const TS_FAILED       = 4;

export const ENCRYPT_NONE    = 0;
export const ENCRYPT_AVAIL   = 1;
export const ENCRYPT_FORCE   = 2;

export const DEP_IN          = 0;
export const DEP_OUT         = 1;

export const DEP_IS_DERIVED_FROM    = 0;
export const DEP_IS_COMPONENT_OF    = 1;
export const DEP_IS_NEW_VERSION_OF  = 2;

export const DepDirFromString = {
    "DEP_IN":DEP_IN,
    "DEP_OUT":DEP_OUT
};

export const DepTypeFromString = {
    "DEP_IS_DERIVED_FROM":DEP_IS_DERIVED_FROM,
    "DEP_IS_COMPONENT_OF":DEP_IS_COMPONENT_OF,
    "DEP_IS_NEW_VERSION_OF":DEP_IS_NEW_VERSION_OF
};
