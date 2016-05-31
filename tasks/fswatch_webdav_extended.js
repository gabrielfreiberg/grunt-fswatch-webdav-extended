/*
 * grunt-fswatch-webdav-extended
 * https://github.com/brian-gonzalez/grunt-fswatch-webdav-extended
 *
 * Copyright (c) 2016 Born Group
 * Licensed under the MIT license.
 */

'use strict';

var path             = require("path"),
    chokidar         = require('chokidar'),
    async            = require("async"),
    fs               = require('fs'),
    request          = require('request'),
    walk             = require('walkdir'),
    lrserver         = require('tiny-lr')(),
    jsdom            = require('jsdom');

module.exports = function(grunt) {
  var options,
      remote;

  var cpCache = [];

  grunt.registerMultiTask('fswatch_webdav_extended', 'Watch for changes', function() {
    this.async();
    options   = this.options({
      ignored_remotes: [],
      localPath: process.cwd(),
      cartridge: '',
      customPort: 35729
    });

    if (!options.userName) { grunt.fail.warn('Missing username option'); }
    if (!options.host) { grunt.fail.warn('Missing host option'); }
    if (!options.password) { grunt.fail.warn('Missing password option'); }

    options.livereloadFilesList = this.filesSrc;
    options.ignoredFilesList = grunt.file.expand(options.ignored_files);
    
    remote = "https://" + options.userName + ":" + options.password + "@" + options.host;

    logMatchingFiles.call(this);
    findLatestRemote(options, startLocalWatch);

    process.on('exit', function(){
      cpCache.forEach(function (p) {
          p.kill('SIGKILL');
      });
      lrserver.close();
    });

  });

  /**
   * Uses jsdom to try and retrieve a remote folder name (cartridge)
   * by getting the latest modified from the list.
   * If another folder was modified but it is not the currently active one,
   * I encourage using the sending a custom cartridge name using the 'cartridge' option.
   * @param  {Function} callback [function to run after the latest folder is retrieved or when a custom cartridge is supplied]
   */
  function findLatestRemote(options, callback) {

    if (remote.indexOf(remote.length - 1) === '/') {
      remote = remote.substr(0, remote.length - 1);
    }

    grunt.log.writeln('Preparing to get latest folder...');

    var requestOptions = {url: remote, method: 'GET'};

    request(requestOptions, function (err, res, body) {
      if (err) {
        console.log(err);
        return;
      }

      if( !options.cartridge ){
        jsdom.env(
          body,
          ["http://code.jquery.com/jquery.js"],
          function (err, window) {
            var $ = window.$,
                rows = [],
                dates = [],
                $this,
                date,
                tmp;

            $("td:last-child tt").each(function () {
                tmp = {};
                $this = $(this);
                date = new Date($(this).html());

                tmp.$el = $this;
                tmp.date = date;

                rows.push(tmp);
            });

            if (rows.length < 1){
              grunt.fail.warn('Could not find a remote. Check your credentials!')
            }

            rows.sort(function (a, b) {
                return b.date.getTime() - a.date.getTime();
            });

            options.cartridge = (rows[0].$el.closest('tr').find('td:first-child').text());


            for (var i = 0; i < rows.length - 1; i++){
              var fail = false;
              options.ignored_remotes.forEach(function(r){
                if (options.cartridge.indexOf(r) !== -1) {
                  fail = true;
                  return;
                }
              });

              if (fail) {
                options.cartridge = rows[i + 1].$el.closest('tr').find('td:first-child').text();
              }
            }

            callback(formatRemoteString(options.cartridge));
          }
        );
      }

      else{
        callback(formatRemoteString(options.cartridge));
      }
    });
  }

  /**
   * Formats the remote URL string, appending the newly found cartridge name.
   * @param  {[String]} cartridge [cartridge name]
   * @return {[Strign]}           [final remote URL]
   */
  function formatRemoteString(cartridge){
    cartridge = cartridge.replace(/[\s\/]/g, "");
    grunt.log.writeln('Folder found: ' + cartridge['green']);

    remote = remote[remote.length - 1] === '/' ? remote + cartridge : remote + '/' + cartridge;

    return remote;
  }

  /**
   * Using chokidar to watch for file changes on your local.
   * Files will be synced to your WebDAV configuration after every file change (update, add, remove), unless ignored. 
   * Files can be ignored using the 'ignored_files' option.
   * Files added to the 'files' object will be livereloaded. 
   * @param  {[String]} remote [URL of the target folder/cartridge to sync files into]
   */
  function startLocalWatch(remote) {

    var watcher = chokidar.watch(options.localPath, {
        persistent: true,
        ignoreInitial: true,
        alwaysStat: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
    });

    startLivereload(options.customPort);

    cpCache.push(watcher);

    watcher.on('raw', processChange);

  }

  function processChange(event, path, details){
    grunt.log.writeln('Local Path is: ', path);

    var sharedPath = path.substring(options.localPath.length),
        cleanSharedPath = sharedPath[0] === '/' ? sharedPath.substring(1) : sharedPath;
    
    grunt.log.writeln('Shared Path is: ', sharedPath);

    if(options.ignoredFilesList.indexOf(cleanSharedPath) !== -1){
      logWaiting('File ignored.\n'['blue'].bold);
    }

    else{
      syncChange(sharedPath, remote, processLivereload);
    }
  }

  /**
   * Starts livereload server
   * @param  {[Number]} port [livereload server port. Defaults to 35729]
   */
  function startLivereload(port){
    lrserver.listen(port, function(err){
      if(!!err){
        grunt.fail.warn(err);
        return;
      }

      logWaiting('Livereload server started.');
    });
  }

  /**
   * Checks if the changed file is in the livereloadable files list.
   * If so, refreshes the file directly on the browser using tiny-lr
   * @param  {[type]} fileDir [description]
   */
  function processLivereload(fileDir){
    var fileName = fileDir.substring(remote.length).toString();
          
    if (fileName[0] === '/'){
      fileName = fileName.substring(1);
    }

    if (options.livereloadFilesList.indexOf(fileName) !== -1){
      fileName = new Array(fileName);
      lrserver.changed({body: {files: fileName}});
      grunt.log.writeln('Livereloading: ' + fileName);
    }

    logWaiting();
  }

  /**
   * Logs wait string. Nothnig else.
   */
  function logWaiting(doneString){
    var prefix = doneString || '';

    grunt.log.writeln(prefix + '\nWaiting for changes...\n');
  }

  /**
   * Sets changed file or directory for update on the server
   * @param  {[String]}   sharedPath [file path to be updated on the server]
   * @param  {[String]}   remote     [target URL]
   * @param  {Function} callback   [description]
   */
  function syncChange(sharedPath, remote, callback){
    if (remote[remote.length - 1] !== '/' && sharedPath[0] !== '/'){
      sharedPath = '/' + sharedPath;
    }
    
    var destPath      = remote + sharedPath,
        absLocalPath  = options.localPath + sharedPath;
    
    try {
        var stats = fs.lstatSync(absLocalPath);

        if (stats.isDirectory()){ 
            postDir(absLocalPath, destPath, sharedPath, callback);
        }
        else {
            putFile(absLocalPath, destPath, callback);
        }
    }
    catch(e){
        if ((e.errno === 34 || e.errno === -2) && destPath !== remote){
            deleteItem(destPath, callback);
        }
        grunt.log.writeln(e);
    }
  }

  /**
   * Removes a specified file from the remote server
   * @param  {[type]}   destPath [description]
   * @param  {Function} callback [description]
   */
  function deleteItem(destPath, callback){
    request.del(destPath).on('response', function(response){
      grunt.log.writeln('File or Directory that was being watched was no longer found in local files')
      grunt.log.writeln('Deleting from remote server at ' + destPath)
      grunt.log.writeln('Server returned ' + response.statusCode );
      callback(destPath);
    });
  }

  function putFile(filePath, destPath, callback){
    fs.createReadStream(filePath).pipe(request.put(destPath).on('response',
        function(response){
          var warnString = 'Server returned: ' + response.statusCode;

            if(response.statusCode >= 200 && response.statusCode < 300){
              grunt.log.writeln('File match. ' + warnString + '\n' + 'Writing to ' + destPath['green']);
              callback(destPath);
            }  

            else{
              logWaiting('Couldn\'t match file on server. ' + warnString['red']);
            }         
        }));    
  }

  function postDir(dirPath, destPath, sharedPath, lrCallback){
    var requestOptions = {
          url: destPath,
          method: 'MKCOL'
        };

    function rqCallback (err, response, body){
        if (!err && response.statusCode == 200) {
            grunt.log.writeln('Folder created at ' + destPath);
        }else{
            grunt.log.writeln('Status code: ' + response.statusCode);
        }
    }
    grunt.log.writeln('New directory found at ' + dirPath + '. Writing.');
    request(requestOptions, rqCallback);
    postDirContents(dirPath, lrCallback);
  }

  function postDirContents(dirPath, callback){
    grunt.log.writeln('Posting directory contents...');
    walk(dirPath, function(path, stat){
        grunt.log.writeln('found file or directory at ' + path + '...');
        
        var sharedPath = path.substring(options.localPath.length);
        syncChange(sharedPath, remote, callback);
    });
  }

  /**
   * Just logs the found file count
   */
  function logMatchingFiles(){
    grunt.log.writeln('Looking for files to livereload...');
    grunt.log.writeln('Found ' + this.filesSrc.length + ' files...');
  }
};