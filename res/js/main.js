var cwd = "";
var cwd_contents = "";

window.onload = function() {
    bind_events();
    jsh.pages.view.open();
    open_path([]);
    setInterval(function() {
        open_path(cwd);
    }, 1000);
};

function bind_events() {
    jsh.get("#breadcrumbs").children[0].addEventListener("click", on_breadcrumb_click);

    jsh.get("#sidebar > #home").addEventListener("click", function() {
        open_path([]);
    });

    var search_tray = jsh.get("#search_tray");
    jsh.get("#search").addEventListener("focusin", function() {
        search_tray.classList.remove("jsh_display_none");
    });

    jsh.get("#search").addEventListener("focusout", function(e) {
        setTimeout(function() {
            search_tray.classList.add("jsh_display_none");
        }, 100);
    });

    jsh.get("#search").addEventListener("keyup", function(e) {
        search(e.target.value);
    });

    jsh.get("#upload").addEventListener("click", on_upload_click);

    jsh.get("#new_folder").addEventListener("click", on_new_folder_click);

    jsh.addEventListener("alert_open", on_alert_open);
}

function open_path(path, selected) {
    if (path !== cwd || selected !== undefined) {
        deselect_all_entries();
        set_cwd(path);
    }
    get_path_contents(path, function(response) {
        if (JSON.stringify(response) !== JSON.stringify(cwd_contents) || selected !== undefined) {
            cwd_contents = response;
            update_entry_table(response, path, selected);
        }
    });
}

function update_entry_table(entries, path, selected) {
    var entry_table = jsh.get("#file_view > #entry_table").children[0];
    for (var i = entry_table.children.length - 1; i > 0; i--) {
        entry_table.children[i].remove()
    }

    var size_units = ["bytes", "kb", "mb", "gb", "tb"];
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
        "November", "December"];
    for (i = 0; i < entries.length; i++) {
        var name_cell = document.createElement("td");
        var icon = document.createElement("span");
        var name_span = document.createElement("span");
        icon.classList.add("icon");
        icon.classList.add(entries[i].type + "_icon_gray");
        name_span.innerHTML += entries[i].name;
        name_span.classList.add("name_span");
        name_cell.appendChild(icon);
        name_cell.appendChild(name_span);

        var size_cell = document.createElement("td");
        var size = entries[i]["size_bytes"];
        var size_index = 0;
        while (size > 1024) {
            size /= 1024;
            size_index += 1;
        }
        size = +size.toFixed(2);
        size_cell.innerText = size === -1 ? "-" : jsh.str("{} {}", size, size_units[size_index]);
        size_cell.classList.add("monospace");

        var date_added_cell = document.createElement("td");
        var date_added = new Date();
        date_added.setTime(entries[i]["date_added"]);
        var date_added_text = jsh.str("{} {}, {}", months[date_added.getMonth()], date_added.getDate(),
            date_added.getFullYear());
        date_added_cell.innerText = date_added_text;

        var table_entry = document.createElement("tr");
        table_entry.setAttribute("type", entries[i].type);
        table_entry.setAttribute("path", jsh.str("/{}/{}{}", path.join("/"), entries[i].name,
            entries[i].type === "folder" ? "/" : ""));
        table_entry.appendChild(name_cell);
        table_entry.setAttribute("name", entries[i].name);
        table_entry.appendChild(size_cell);
        table_entry.setAttribute("size", jsh.str("{} {}", size, size_units[size_index]));
        table_entry.appendChild(date_added_cell);
        table_entry.setAttribute("date_added", date_added_text);
        table_entry.addEventListener("click", entry_click_handler);
        table_entry.addEventListener("dblclick", entry_double_click_handler);
        table_entry.addEventListener("contextmenu", entry_context_menu_handler);
        entry_table.appendChild(table_entry);

        if (selected !== undefined && entries[i].name === selected) table_entry.click();
    }
}

function entry_click_handler(e) {
    e.stopPropagation();

    var target = e.target;
    while (target.tagName !== "TR") {
        target = target.parentNode;
    }

    deselect_all_entries();
    target.classList.add("selected_entry");

    var img_url = jsh.str("./res/img/{}_icon.png", target.getAttribute("type"));
    var filename = target.getAttribute("name");
    var info = {
        "size":  target.getAttribute("type") === "folder" ? "-" : target.getAttribute("size"),
        "date added": target.getAttribute("date_added")
    };

    update_details_tray(img_url, filename, info);
}

function entry_context_menu_handler(e) {
    e.preventDefault();
    var context_menu = document.createElement("div");
    context_menu.addEventListener("focusout", context_menu_focus_out_handler);
    context_menu.id = "context_menu";
    context_menu.setAttribute("tabindex", "-1");
    context_menu.style.top = Math.min(e.clientY, window.innerHeight - 130) + "px";
    context_menu.style.left = e.clientX + 10 + "px";
    document.body.appendChild(context_menu);
    context_menu.focus();

    var item = document.createElement("div");
    item.classList.add("item");
    item.innerText = "select";
    item.addEventListener("click", function() {
        entry_click_handler(e);
        context_menu.remove();
    });
    context_menu.appendChild(item);

    item = document.createElement("div");
    item.classList.add("item");
    item.innerText = "open";
    item.addEventListener("click", function() {
        entry_double_click_handler(e);
        context_menu.remove();
    });
    context_menu.appendChild(item);

    item = document.createElement("div");
    item.classList.add("item");
    item.innerText = "delete";
    item.addEventListener("click", function() {
        delete_item(e);
        context_menu.remove();
    });
    item.style.color = "#a00";
    context_menu.appendChild(item);
}

function context_menu_focus_out_handler(e) {
    e.target.remove();
}

function entry_double_click_handler(e) {
    var tr = e.target.tagName === "TR" ? e.target :
        e.target.parentNode.tagName === "TR" ? e.target.parentNode :
            e.target.parentNode.parentNode;

    if (tr.getAttribute("type") === "folder") {
        open_path(cwd.concat(tr.getAttribute("name")));
    } else {
        new jsh.Alert({
            title: "Loading..."
        }).open();
        try_image_load(tr, cwd.concat(tr.getAttribute("name")).join("/"));
    }
}

function try_image_load(tr, file) {
    var xhr = new XMLHttpRequest();
    xhr.addEventListener("load", function() {
        var reader = new FileReader();
        reader.addEventListener("loadend", function() {
            var img = new Image();
            img.width = 1000;
            img.addEventListener("load", function() {
               new jsh.Alert({
                    title: tr.getAttribute("name"),
                    message: img,
                    medium: true,
                    button_text: "done"
               }).open();
            });
            img.addEventListener("error", function(e) {
                try_pdf_load(tr, xhr.response, reader.result);
            });
            img.src = reader.result;
        });
        reader.readAsDataURL(xhr.response);
    });
    xhr.open("GET", "io/get_file_contents/?file=" + file + "&cache=" + Math.random());
    xhr.responseType = "blob";
    xhr.send();
}

function try_pdf_load(tr, file_blob, data_url) {
    var reader = new FileReader();
    reader.addEventListener("load", function() {
        if (reader.result.substr(0, 7) === "%PDF-1.") {
            var bytes_string = atob(data_url.split(',')[1]);
            var array_buffer = new ArrayBuffer(bytes_string.length);
            var int_array = new Uint8Array(array_buffer);
            for (var i = 0; i < bytes_string.length; i++) {
                int_array[i] = bytes_string.charCodeAt(i);
            }
            var inline_blob = new Blob([array_buffer], {type: "application/pdf"});
            var blob_url = URL.createObjectURL(inline_blob);

            var pdf_frame = document.createElement("iframe");
            pdf_frame.id = "pdf_frame";
            pdf_frame.frameBorder = 0;
            pdf_frame.src = blob_url;

            new jsh.Alert({
                title: tr.getAttribute("name"),
                message: pdf_frame,
                button_text: "done",
                large: true
            }).open();
        } else {
            try_text_load(tr, reader.result);
        }
    });
    reader.readAsText(file_blob);
}

function try_text_load(tr, contents) {
    var monospace = document.createElement("span");
    monospace.classList.add("monospace");
    monospace.innerHTML = contents.replace(/\n/g, "<br>")
        .replace(/\t/g, "<span class=\"tab\"></span>")
        .replace(/ {4}/g, "<span class=\"tab\"></span>");
    new jsh.Alert({
        title: tr.getAttribute("name"),
        message: monospace,
        large: true,
        button_text: "done"
    }).open();
}

function on_alert_open(e) {
    var alert = e.detail.alert;
    if (alert.args.large !== undefined) {
        jsh.get("#jsh_alert_window").classList.remove("jsh_alert_window_medium");

        jsh.get("#jsh_alert_window").classList.add("jsh_alert_window_large");
        jsh.get("#jsh_alert_message").classList.add("jsh_alert_message_large");
        jsh.get("#jsh_alert_message").style.height = window.innerHeight * 0.7 + "px";
    } else if (alert.args.medium !== undefined) {
        jsh.get("#jsh_alert_window").classList.remove("jsh_alert_window_large");
        jsh.get("#jsh_alert_message").classList.remove("jsh_alert_message_large");
        jsh.get("#jsh_alert_message").style.height = "";

        jsh.get("#jsh_alert_window").classList.add("jsh_alert_window_medium");
    } else {
        jsh.get("#jsh_alert_window").classList.remove("jsh_alert_window_large");
        jsh.get("#jsh_alert_window").classList.remove("jsh_alert_window_medium");
        jsh.get("#jsh_alert_message").classList.remove("jsh_alert_message_large");
        jsh.get("#jsh_alert_message").style.height = "";
    }
}

function deselect_all_entries() {
    var entries = jsh.get("#entry_table").children[0].children;
    for (var i = 0; i < entries.length; i++) {
        entries[i].classList.remove("selected_entry");
    }
    clear_details_tray();
}

function clear_details_tray() {
    var details_tray = jsh.get("#details");
    var icon_el = details_tray.children[0];
    var filename_el = details_tray.children[1];
    var info_el = details_tray.children[2].children[0];

    icon_el.style.backgroundImage = "none";
    filename_el.innerText = "";

    for (var i = info_el.children.length - 1; i >= 0; i--) {
        info_el.children[i].remove();
    }
}

function update_details_tray(icon_url, filename, info) {
    var details_tray = jsh.get("#details");
    var icon_el = details_tray.children[0];
    var filename_el = details_tray.children[1];
    var info_el = details_tray.children[2].children[0];

    icon_el.style.backgroundImage = jsh.str("url({})", icon_url);
    filename_el.innerText = filename;

    for (var i = info_el.children.length - 1; i >= 0; i--) {
        info_el.children[i].remove();
    }

    for (var attr in info) {
        if (info.hasOwnProperty(attr)) {
            var tr = document.createElement("tr");
            var attr_td = document.createElement("td");
            var val_td = document.createElement("td");

            attr_td.innerText = attr;
            val_td.innerText = info[attr];

            tr.appendChild(attr_td);
            tr.appendChild(val_td);
            info_el.appendChild(tr);
        }
    }
}

function get_path_contents(path, callback) {
    new jsh.Request({
        url: "io/list_dir",
        parse_json: true,
        data: {
            name: name,
            path: jsh.str("/{}/", path.join("/"))
        }, callback: function(response) {
            callback(response)
        }
    }).send();
}

function set_cwd(path_list) {
    cwd = path_list;
    jsh.get("#current_folder").innerText = path_list[path_list.length - 1] || "home";

    var breadcrumbs = jsh.get("#breadcrumbs");
    for (var i = breadcrumbs.children.length - 1; i > 0; i--) {
        breadcrumbs.children[i].remove();
    }

    for (i = 0; i < path_list.length; i++) {
        var breadcrumb = document.createElement("span");
        breadcrumb.addEventListener("click", on_breadcrumb_click);
        breadcrumb.classList.add("breadcrumb");

        var max_length = 30;
        if (path_list[i].length > max_length) {
            breadcrumb.innerText = path_list[i].slice(0, max_length - 3) + "...";
        } else {
            breadcrumb.innerText = path_list[i];
        }

        breadcrumbs.append(breadcrumb);
    }
}

function on_breadcrumb_click(e) {
    var found = false;
    var breadcrumbs = jsh.get("#breadcrumbs");
    var new_cwd = [];

    for (var i = breadcrumbs.children.length - 1; i > 0; i--) {
        if (breadcrumbs.children[i].isSameNode(e.target)) found = true;
        if (found) new_cwd.unshift(breadcrumbs.children[i].innerText);
    }

    open_path(new_cwd);
}

function on_upload_click(e) {
    var contents = document.createElement("div");
    var upload_input = document.createElement("input");
    upload_input.id = "upload_input";
    upload_input.type = "file";
    contents.appendChild(upload_input);

    var upload_password = document.createElement("input");
    upload_password.id = "upload_password";
    upload_password.type = "password";
    upload_password.setAttribute("placeholder", "password");
    contents.appendChild(upload_password);

    var upload_progress_outer = document.createElement("div");
    upload_progress_outer.id = "upload_progress_outer";
    upload_progress_outer.classList.add("jsh_display_none");
    upload_progress_outer.classList.add("jsh_transparent");
    var upload_progress_inner = document.createElement("div");
    upload_progress_inner.id = "upload_progress_inner";
    upload_progress_outer.appendChild(upload_progress_inner);
    contents.appendChild(upload_progress_outer);

    new jsh.Alert({
        title: "Upload File",
        show_cancel: true,
        message: contents,
        button_text: "upload",
        button_callback: function() {
            var file = document.getElementById("upload_input").files[0];
            var password = document.getElementById("upload_password").value;
            upload_file(file, password);
        }
    }).open();
}

function on_new_folder_click(e) {
    var contents = document.createElement("div");
    var new_folder_name_input = document.createElement("input");
    new_folder_name_input.id = "new_folder_name_input";
    new_folder_name_input.setAttribute("placeholder", "new folder name");
    contents.appendChild(new_folder_name_input);

    new jsh.Alert({
        title: "New Folder",
        show_cancel: true,
        message: contents,
        button_text: "create",
        button_callback: function() {
            var name = jsh.get("#new_folder_name_input").value;
            new_folder(name);
        }
    }).open();
}

function search(query) {
    new jsh.Request({
        url: "io/search",
        parse_json: true,
        data: {
            name: name,
            query: query
        }, callback: function(response) {
            var search_tray = jsh.get("#search_tray");
            search_tray.innerHTML = "";
            if (response["error"] === undefined) {
                var files = response["files"];
                for (var i = 0; i < files.length; i++) {
                    var filename = files[i].split("/").pop();
                    var path = files[i].slice(0, files[i].length - filename.length);

                    var result = document.createElement("div");
                    result.innerText = filename;
                    result.classList.add("result");
                    result.setAttribute("path", path);
                    result.addEventListener("mousedown", function(e) {
                        var path_list = e.target.getAttribute("path").split("/").filter(function(x) {
                            return x !== ''
                        });
                        open_path(path_list, e.target.innerText);
                    });
                    search_tray.appendChild(result);
                }
                var time_div = document.createElement("div");
                time_div.innerText = "found in: " + response["time"] + "s";
                time_div.classList.add("result");
                time_div.classList.add("disabled");
                search_tray.appendChild(time_div);

            } else {
                result = document.createElement("div");
                result.innerText = response["error"];
                result.classList.add("result");
                result.classList.add("disabled");
                search_tray.appendChild(result);
            }
        }
    }).send();
}

function upload_file(file, password) {
    jsh.get("#upload_password").remove();
    jsh.get("#upload_progress_outer").classList.remove("jsh_display_none");
    setTimeout(function() {
        jsh.get("#upload_progress_outer").classList.remove("jsh_transparent");
    }, 10);

    var request = new XMLHttpRequest();
    request.onloadend = function() {
        var response = JSON.parse(request.responseText);
        if (response["error"] === undefined) {
            open_path(cwd);
            new jsh.Alert({
                message: "Upload complete!",
                title: "Success"
            }).open();
        } else {
            new jsh.Alert({
                message: response["error"],
                title: "Error"
            }).open();
        }
    };
    request.upload.addEventListener("progress", function(e) {
        var percent = (e["loaded"] / e["total"] * 100);
        jsh.get("#upload_progress_inner").setAttribute("style", "width: " + percent + "%");
    }, false);

    request.upload.addEventListener("load", function(e) {
        new jsh.Alert({
            message: "",
            title: "Indexing..."
        }).open();
    }, false);

    request.open("POST", "io/upload/", true);
    request.setRequestHeader("filename", file.name);
    request.setRequestHeader("password", password);
    request.setRequestHeader("path", jsh.str("/{}/", cwd.join("/")));
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.send(file);
}

function new_folder(name) {
    new jsh.Request({
        url: "io/new_folder",
        data: {
            name: name,
            path: jsh.str("/{}/", cwd.join("/"))
        }, callback: function(response) {
            if (response["error"] === undefined) {
                open_path(cwd);
                new jsh.Alert().close();
            } else {
                new jsh.Alert({
                    message: response["error"],
                    title: "Error"
                }).open();
            }
        }
    }).send();
}

function delete_item(e) {
    var tr = e.target.tagName === "TR" ? e.target :
        e.target.parentNode.tagName === "TR" ? e.target.parentNode :
            e.target.parentNode.parentNode;

    new jsh.Request({
        url: "io/delete_item",
        data: {
            path: tr.getAttribute("path")
        }, callback: function(response) {
            if (response["error"] === undefined) {
                open_path(cwd);
                new jsh.Alert().close();
            } else {
                new jsh.Alert({
                    message: response["error"],
                    title: "Error"
                }).open();
            }
        }
    }).send();
}