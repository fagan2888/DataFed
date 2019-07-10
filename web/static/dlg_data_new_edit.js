var DLG_DATA_NEW = 0;
var DLG_DATA_EDIT = 1;
var DLG_DATA_DUP = 2;
var DLG_DATA_LABEL = ["New", "Edit", "Copy"];
var DLG_DATA_BTN_LABEL = ["Create", "Update", "Duplicate"];

//<tr><td title='Metadata JSON document (optional)'>Metadata:</td><td colspan='2'><textarea id='md' rows=7 style='width:100%'></textarea></td></tr>

function dlgDataNewEdit(a_mode,a_data,a_parent,a_upd_perms,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<div id='dlg-tabs' style='height:100%;padding:0' class='tabs-no-header no-border'>\
            <ul>\
                <li><a href='#tab-dlg-gen'>General</a></li>\
                <li><a href='#tab-dlg-ref'>References</a></li>\
                <li><a href='#tab-dlg-meta'>Metadata</a></li>\
            </ul>\
            <div id='tab-dlg-gen' style='padding:1em'>\
                <table class='form-table'>\
                    <tr><td>Title: <span class='note'>*</span></td><td colspan='3'><input title='Title string (required)' type='text' id='title' style='width:100%'></input></td></tr>\
                    <tr><td>Alias:</td><td colspan='3'><input title='Alias ID (optional)' type='text' id='alias' style='width:100%'></input></td></tr>\
                    <tr><td>Description:</td><td colspan='3'><textarea title='Description string (optional)' id='desc' rows=6 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td>Keywords:</td><td colspan='3'><input title='Keywords (optional, comma delimited)' type='text' id='keyw' style='width:100%'></input></td></tr>\
                    <tr><td>Topic:</td><td colspan='2'><input title='Topic string (optional)' type='text' id='topic' style='width:100%'></input></td><td style='width:1em'><button title='Browse topics' id='pick_topic' class='btn' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-structure' style='font-size:.9em'></span></button></td></tr>\
                    <tr id='dlg_coll_row'><td>Parent: <span class='note'>*</span></td><td colspan='3'><input title='Parent collection ID or alias (required)' type='text' id='coll' style='width:100%'></input></td></tr>\
                    <tr id='dlg_alloc_row'><td style='vertical-align:middle'>Allocation:</td><td colspan='3'><select title='Data repository allocation (required)' id='alloc'><option value='bad'>----</option></select></td></tr>\
                    <tr id='dlg_put_row'><td>Source:</td><td colspan='2'><input title='Full globus path to source data file (optional)' type='text' id='source_file' style='width:100%'></input></td><td style='width:1em'><button title='Browse end-points' id='pick_source' class='btn' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-file' style='font-size:.9em'></span></button></tr>\
                    <tr><td>Extension:</td><td><input title='Data record file extension (optional)' type='text' id='extension' style='width:100%'></input></td><td colspan='2'><span title='Automatically assign extension from source data file' style='display:inline-block;white-space:nowrap'><label for='ext_auto'>Auto&nbspExt.</label><input id='ext_auto' type='checkbox'></input></span></td></tr>\
                </table>\
            </div>\
            <div id='tab-dlg-ref' style='padding:1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:1 1 auto;overflow:auto'>\
                        <table id='ref-table'>\
                            <tr class='ref-row'><td><select class='ref-type'><option value='0'>Is derived from</option><option value='1'>Is a component of</option><option value='2'>Is newer version of</option></select></td><td style='width:100%'><input type='text' style='width:100%'></input></td><td><button title='Find data record' class='btn find-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-zoom' style='font-size:.9em'></span></button></td><td><button title='Remove reference' class='btn rem-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-close' style='font-size:.9em'></span></button></td></tr>\
                        </table>\
                    </div>\
                    <div style='flex:none;padding:1em 0 0 .1em'><button title='Add new reference' class='btn add-ref'>Add Reference</button></div>\
                </div>\
            </div>\
            <div id='tab-dlg-meta' style='padding:1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none'>\
                        Enter metadata as JSON: <span style='float:right'><a href='https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts' target='_blank'>editor help</a></span>\
                    </div>\
                    <div class='ui-widget ui-widget-content' style='flex:1 1 100%;padding:0'>\
                        <div id='md' style='height:100%;width:100%'></div>\
                    </div>\
                    <div id='dlg_md_row2' style='flex:none;padding:.5em 2px 2px 2px'><span>Metadata update mode:</span>\
                        <input type='radio' id='md_merge' name='md_mode' value='merge'/>\
                        <label for='md_merge'>Merge</label>\
                        <input type='radio' id='md_set' name='md_mode' value='set' checked/>\
                        <label for='md_set'>Replace</label>\
                    </div>\
                </div>\
            </div>\
        </div>" );

    var dlg_title;
    if ( a_data && ( a_mode == DLG_DATA_EDIT || a_mode == DLG_DATA_DUP ))
        dlg_title = DLG_DATA_LABEL[a_mode] + " Data Record " + a_data.id;
    else if ( a_mode == DLG_DATA_NEW )
        dlg_title = "New Data Record";
    else
        return;

    inputTheme( $('input:text',frame ));
    inputTheme( $('textarea',frame ));

    $(".btn",frame).button();

    $("#pick_topic",frame).on("click",function(){
        dlgPickTopic( function( topic ){
            $("#topic",frame).val( topic );
        });
    });

    $("#pick_source",frame).on("click",function(){
        dlgStartTransfer( XFR_SELECT, null, function( path ){
            $("#source_file",frame).val( path );
            if ( $("#ext_auto",frame).prop("checked") )
                updateAutoExt();
        });
    });

    $(".add-ref",frame).on("click",function(){
        addRef();
    });

    $(".rem-ref",frame).on("click",function(ev){
        remRef(ev);
    });

    $(".find-ref",frame).on("click",function(ev){
        findRef(ev);
    });

    var jsoned;
    var ref_rows = 1;

    function addRef(){
        var row = $("<tr class='ref-row'><td><select><option value='0'>Is derived from</option><option value='1'>Is a component of</option><option value='2'>Is newer version of</option></select></td><td style='width:100%'><input type='text' style='width:100%'></input></td><td><button title='Find data record' class='btn find-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-zoom' style='font-size:.9em'></span></button></td><td><button title='Remove reference' class='btn rem-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-close' style='font-size:.9em'></span></button></td></tr>");

        row.insertAfter("#ref-table tr:last",frame);
        $("select",row).selectmenu({width:200});
        $(".btn",row).button();
        inputTheme( $('input:text',row ));
        $(".rem-ref",row).on("click",function(ev){
            remRef(ev);
        });
        $(".find-ref",row).on("click",function(ev){
            remRef(ev);
        });
        ref_rows++;
    }

    function remRef(ev){
        //console.log("remove ref",ev.currentTarget);
        var tr = ev.currentTarget.closest("tr");
        if ( ref_rows > 1 ){
            if ( tr ){
                tr.remove();
            }
            ref_rows--;
        }else{
            $("input",tr).val("");
        }
    }

    function findRef(ev){
        //console.log("remove ref",ev.currentTarget);
        dlgPickData( function( data_id ){
            var tr = ev.currentTarget.closest("tr");
            $("input",tr).val(data_id);
        });
    }

    function updateAllocSelect(){
        var coll_id = $("#coll",frame).val();
        console.log("updateAllocSelect", coll_id );
        allocListByObject( coll_id, function( ok, data ){
            console.log( "updateAllocSelect", ok, data );
            var html;
            var have_cap = false;
            if ( ok ){
                if ( data.length == 0 ){
                    html="<option value='bad'>(no allocation)</option>";
                }else{
                    var alloc;
                    html = "";
                    for ( var i in data ){
                        alloc = data[i];
                        //console.log( "alloc", alloc );
                        if ( alloc.subAlloc ){
                            html += "<option value='default'";
                        }else{
                            html += "<option value='"+alloc.repo + "'";
                        }

                        if ( parseInt( alloc.totSize ) < parseInt( alloc.maxSize ))
                            have_cap = true;
                        else
                            html += " disabled";

                        html += ">"+(alloc.subAlloc?"Default":alloc.repo.substr(5))+" ("+ sizeToString(alloc.totSize) + " / " + sizeToString(alloc.maxSize) +")</option>";
                    }

                    if ( !have_cap || !data.length ){
                        if ( data.length && !have_cap ){
                            dlgAlert("Data Allocation Error","All available storage allocations are full.");
                            frame.dialog('destroy').remove();
                            return;
                        }else{
                            viewColl( coll_id, function( data2 ){
                                console.log(data2);
                                if ( data2 ){
                                    if ( data2.owner.startsWith( "u/" )){
                                        dlgAlert("Data Allocation Error","No available storage allocations.");
                                        frame.dialog('destroy').remove();
                                        return;
                                    }else{
                                        viewProj( data2.owner, function( proj ){
                                            if ( proj ){
                                                if ( !proj.subRepo ){
                                                    dlgAlert("Data Allocation Error","No available storage allocations.");
                                                    frame.dialog('destroy').remove();
                                                    return;
                                                }else if ( parseInt( proj.subUsage ) >= parseInt( proj.subAlloc )){
                                                    dlgAlert("Data Allocation Error","Project sub-allocation is full.");
                                                    frame.dialog('destroy').remove();
                                                    return;
                                                }else{
                                                    $("#do_it").button("enable");
                                                }
                                            }else{
                                                $("#do_it").button("enable");
                                            }
                                        });
                                    }
                                }else{
                                    // Something went wrong - collection changed, no view permission?
                                    // Just go ahead and let user try to create since we can't confirm default is valid here
                                    $("#do_it").button("enable");
                                }
                            });
                        }
                    }else{
                        $("#do_it").button("enable");
                    }
                }
            }else{
                html="<option value='bad'>(invalid parent)</option>";
            }
            $("#alloc",frame).html(html);
            $("#alloc",frame).selectmenu("refresh");
        });
    }

    function updateAutoExt(){
        var src = $("#source_file",frame).val(),ext="";
        if ( src ){
            var p = src.indexOf("/");
            if ( p != -1 ){
                p = src.indexOf(".",p);
                if ( p != -1 ){
                    ext = src.substr(p) + " ";
                }
            }
        }
        $("#extension",frame).val( ext + '(auto)');
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 500,
        height: 530,
        resizable: true,
        resizeStop: function(ev,ui){
            //console.log("resized");
            $("#dlg-tabs",frame).tabs("refresh");
        },
        closeOnEscape: false,
        buttons: [{
            id: "do_it",
            text: DLG_DATA_BTN_LABEL[a_mode],
            click: function() {
                var obj = {};
                var url = "/api/dat/";

                var anno = jsoned.getSession().getAnnotations();
                if ( anno && anno.length ){
                    dlgAlert( "Data Entry Error", "Metadata field has unresolved errors.");
                    return;
                }

                var id,type,deps = [];
                $(".ref-row",frame).each(function(idx,ele){
                    id = $("input",ele).val();
                    if ( id ){
                        type = parseInt($("select",ele).val());
                        deps.push({id:id,type:type,dir:DEP_OUT});
                    }
                });

                if ( a_data && a_mode == DLG_DATA_EDIT ){
                    url += "update";

                    getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), a_data, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), a_data, obj, "desc" );
                    getUpdatedValue( $("#keyw",frame).val(), a_data, obj, "keyw" );
                    getUpdatedValue( $("#topic",frame).val().toLowerCase(), a_data, obj, "topic" );
                    getUpdatedValue( jsoned.getValue(), a_data, obj, "metadata" );

                    if ( $("#ext_auto",frame).prop("checked") ){
                        if ( !a_data.extAuto )
                            obj.extAuto = true;
                    }else{
                        if ( a_data.extAuto )
                            obj.extAuto = false;

                        getUpdatedValue( $("#extension",frame).val(), a_data, obj, "ext" );
                    }

                    if ( obj.metadata != undefined && $('input[name=md_mode]:checked', frame ).val() == "set" )
                        obj.mdset = true;

                    // TODO compare new and old deps for differences
                    obj.depsAdd = deps;
                    obj.depsClear = true;

                    if ( Object.keys(obj).length === 0 ){
                        jsoned.destroy();
                        $(this).dialog('destroy').remove();
                        return;
                    }

                    obj.id = a_data.id;
                }else{
                    url += "create";

                    getUpdatedValue( $("#title",frame).val(), {}, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), {}, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), {}, obj, "desc" );
                    getUpdatedValue( $("#keyw",frame).val(), {}, obj, "keyw" );
                    getUpdatedValue( $("#topic",frame).val(), {}, obj, "topic" );

                    if ( $("#ext_auto",frame).prop("checked") ){
                        obj.extAuto = true;
                    }else{
                        getUpdatedValue( $("#extension",frame).val(), {}, obj, "ext" );
                    }

                    var tmp = jsoned.getValue();
                    if ( tmp )
                        obj.metadata = tmp;

                    if ( deps.length )
                        obj.deps = deps;
                }

                if ( a_mode != DLG_DATA_EDIT ){
                    var repo_id = $("#alloc").val();
                    if ( repo_id == "bad" ){
                        dlgAlert( "Data Entry Error", "Parent collection is invalid");
                        return;
                    }else if (repo_id != 'default' )
                        obj.repoId = repo_id;

                    obj.parentId = $("#coll",frame).val().trim();
                }

                var inst = $(this);

                console.log("data upd, obj:",obj);

                _asyncPost( url, obj, function( ok, data ){
                    if ( ok ) {
                        tmp = $("#source_file").val().trim();
                        if ( tmp && a_mode != DLG_DATA_EDIT ){
                            xfrStart( data.data[0].id, XFR_PUT, tmp, 0, function( ok2, data2 ){
                                if ( ok2 ){
                                    dlgAlert( "Transfer Initiated", "Data transfer ID and progress will be shown under the 'Transfers' tab on the main window." );
                                }else{
                                    dlgAlert( "Transfer Error", data2 );
                                }
                            });
                        }

                        jsoned.destroy();
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0],obj.parentId);

                    } else {
                        dlgAlert( "Data "+DLG_DATA_BTN_LABEL[a_mode]+" Error", data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                jsoned.destroy();
                $(this).dialog('destroy').remove();
            }
        }],
        resize: function(){
            jsoned.resize();
        },
        open: function(ev,ui){
            $(this).css('padding', '0');

            $("#dlg-tabs",frame).tabs({heightStyle:"fill"});
                //.css({'overflow': 'auto'});

            var widget = frame.dialog( "widget" );
            $(".ui-dialog-buttonpane",widget).append("<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>");

            $("select",frame).selectmenu({width:250});

    
            jsoned = ace.edit("md", {
                theme:(g_theme=="light"?"ace/theme/light":"ace/theme/dark"),
                mode:"ace/mode/json",
                fontSize:16,
                autoScrollEditorIntoView:true
                //wrap:true
            });

            var parent;
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }

                $("#desc",frame).val(a_data.desc);
                $("#keyw",frame).val(a_data.keyw);
                $("#topic",frame).val(a_data.topic);

                if ( a_data.metadata )
                    jsoned.setValue( a_data.metadata, -1 );

                if ( a_data.deps && a_data.deps.length ){
                    var i,dep;
                    for ( i in a_data.deps ){
                        dep = a_data.deps[i];
                        console.log("dep",dep);
                        if ( dep.dir == "DEP_OUT" ){
                            row = $("#ref-table tr:last",frame);
                            $("input",row).val(dep.alias?dep.alias:dep.id);
                            $("select",row).val(DepTypeFromString[dep.type]).selectmenu("refresh");
                            addRef();
                        }
                    }
                }

                if ( a_mode == DLG_DATA_EDIT ){
                    if (( a_upd_perms & PERM_WR_META ) == 0 ){
                        jsoned.setReadOnly(true);
                        $("#md_status").text("(read only)");
                        $("#md_mode",frame).prop('disabled',true);
                        $("#md_merge",frame).attr('disabled',true);
                        $("#md_set",frame).attr('disabled',true);
                    }
                    if (( a_upd_perms & PERM_WR_REC ) == 0 ){
                        inputDisable( $("#title,#desc,#alias,#topic,#keyw", frame ));
                        $("#pick_topic",frame).button("disable");
                    }

                    $("#dlg_coll_row",frame).css("display","none");
                    $("#dlg_alloc_row",frame).css("display","none");
                    //$("#dlg_put_row",frame).css("display","none");
                    $("#source_file",frame).val(a_data.source); //.prop("disabled",true);
                    //$("#pick_source",frame).button("disable");
                    if ( a_data.extAuto ){
                        $("#ext_auto",frame).prop("checked",true);
                        $("#extension",frame).val(a_data.ext + " (auto)").prop("disabled",true);
                    }else{
                        $("#extension",frame).val(a_data.ext);
                    }
                }else{
                    $("#dlg_md_row2",frame).css("display","none");
                    parent = "root";
                }
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#keyw",frame).val("");
                $("#topic",frame).val("");
                //$("#md",frame).val("");
                $("#dlg_md_row2",frame).css("display","none");
                if ( a_parent )
                    parent = a_parent;
                $("#ext_auto",frame).prop("checked",true);
                $("#extension",frame).val("(auto)").prop("disabled",true);
            }

            var srcEditTimer;
            $("#source_file",frame).on("input",function(ev){
                if ( srcEditTimer )
                    clearTimeout( srcEditTimer );

                srcEditTimer = setTimeout( function(){ if ( $("#ext_auto",frame).prop("checked") ){ updateAutoExt() }}, 1000 );
            });

            $("#ext_auto",frame).checkboxradio().on( "change",function(ev){
                var auto = $("#ext_auto",frame).prop("checked");
                if ( auto ){
                    updateAutoExt();
                    $("#extension",frame).prop("disabled",true);
                }else{
                    $("#extension",frame).val('').prop("disabled",false);
                }
            });

            var changetimer;
            if ( a_mode == DLG_DATA_NEW )
                $("#do_it").button("disable");

            $("#coll",frame).val( parent ).on( "input", function(){
                if ( changetimer )
                    clearTimeout( changetimer );
                else{
                    $("#do_it").button("disable");
                }

                changetimer = setTimeout( function(){
                    changetimer = null;
                    updateAllocSelect();
                }, 1000 );
            });

            $("#alloc",frame).selectmenu();
            updateAllocSelect();

            jsoned.resize();
        }
    };

    frame.dialog( options );
}