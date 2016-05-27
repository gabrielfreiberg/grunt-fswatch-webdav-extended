/*
 * grunt-fswatch-webdav-extended
 * https://github.com/brian-gonzalez/grunt-fswatch-webdav-extended
 *
 * Copyright (c) 2016 Brian Gonzalez
 * Licensed under the MIT license.
 */

'use strict';

var path             = require("path"),
    chokidar         = require('chokidar'),
    async            = require("async"),
    fs               = require('fs'),
    request          = require('request'),
    walk             = require('walkdir'),
    glob             = require('glob'),
    lrserver         = require('tiny-lr')(),
    jsdom            = require('jsdom');

module.exports = function(grunt) {
  var done,
      options,
      remote,
      password,
      userName,
      host,
      localPath,
      lrPaths,
      child,
      ignorePaths,
      ignoreRemotes,
      customCartridge;

  var cpCache = [];

  grunt.registerMultiTask('fswatch_webdav_extended', '', function() {
    done      = this.async();
    options   = this.options();

    if (!options.userName) { grunt.fail.warn('missing username option'); }
    if (!options.host) { grunt.fail.warn('missing host option'); }
    if (!options.password) { grunt.fail.warn('missing password option'); }

    userName        = options.userName;
    host            = options.host;
    password        = options.password;
    localPath       = options.localPath || process.cwd();
    remote          = "https://" + userName + ":" + password + "@" + host;
    lrPaths         = options.livereload_files || [];
    ignorePaths     = options.ignore_files || [];
    ignoreRemotes   = options.ignore_remotes || [];
    customCartridge = options.customCartridge || '';

    lrserver.listen(35729, function(err){
      grunt.log.writeln('... livereload server started ...');
    });


    findReloadPaths();
    findLatestRemote(newWatchIt);

    process.on('exit', function(){
      cpCache.forEach(function (p) {
          p.kill('SIGKILL');
      });
      lrserver.close();
    });

  });

  function findLatestRemote(callback) {

    if (remote.indexOf(remote.length - 1) === '/') {
      remote = remote.substr(0, remote.length - 1);
    }

    grunt.log.writeln('Preparing to get latest folder');

    var options = {url: remote, method: 'GET'};

    request(options, function (err, res, body) {
      if (err) {
        console.log(err);
        return;
      }

      if(!!customCartridge){
        formatRemoteString(customCartridge, callback);
      }

      else{
        jsdom.env(
          body,
          ["http://code.jquery.com/jquery.js"],
          function (err, window) {
            var $ = window.$;
            var rows = [];
            var dates = [];
            var $this, date, tmp, cartridge;

            $("td:last-child tt").each(function () {
                tmp = {};
                $this = $(this);
                date = new Date($(this).html());

                tmp.$el = $this;
                tmp.date = date;

                rows.push(tmp);
            });

            if (rows.length < 1){
              grunt.fail.warn('could not find anything like a remote... check your credentials')
            }

            rows.sort(function (a, b) {
                return b.date.getTime() - a.date.getTime();
            });

            cartridge = (rows[0].$el.closest('tr').find('td:first-child').text());


            for (var i = 0; i < rows.length - 1; i++){
              var fail = false;
              ignoreRemotes.forEach(function(r){
                if (cartridge.indexOf(r) !== -1) {
                  fail = true;
                  return;
                }
              });

              if (fail) {
                cartridge = rows[i + 1].$el.closest('tr').find('td:first-child').text();
              }
            }

            formatRemoteString(cartridge, callback);
          }
        );
      }
    });
  }

  function formatRemoteString(cartridge, callback){
    cartridge = cartridge.replace(/[\s\/]/g, "");
    grunt.log.writeln('folder found: ' + cartridge['green']);

    remote = remote + '/' + cartridge;
    remote = remote.replace(/\s/g, "");

    callback(remote);
  }

  function newWatchIt(remote) {
    var watcher = chokidar.watch(localPath, {
        persistent: true,
        ignoreInitial: true,
        alwaysStat: true,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
    });

    cpCache.push(watcher);

    watcher.on('raw', function(event, path, details) {

      console.log('PATH IS', path);
      var sharedPath = path.substring(localPath.length);
      console.log('sharedPath is', sharedPath)
      if (ignorePaths.indexOf(sharedPath) === -1){        
        syncChange(sharedPath, remote, localPath, function(change){
          var change = change.substring(remote.length).toString();
          if (change[0] === '/'){
            change = change.substring(1);
          }
          if (lrPaths.indexOf(change) !== -1){
            change = new Array(change);
            lrserver.changed({body: {files: change}});
            console.log('livereloading: ' + change + ' CHANGED');
          }
        });
      } else {
        console.log('FILE ' + sharedPath + ' IGNORED!');
      }
    });

  }






  function syncChange(sharedPath, remote, localPath, callback){
    if (remote[remote.length - 1] !== '/' && sharedPath[0] !== '/'){
      sharedPath = '/' + sharedPath;
    }
    var destPath      = remote + sharedPath;
    var absLocalPath  = localPath + sharedPath;
    try {
        var stats = fs.lstatSync(absLocalPath);
        if (stats.isDirectory()){ 
            destPath = destPath.replace('/SaksOff5thStorefront', '/');
            postDir(absLocalPath, destPath, sharedPath, callback);
        } else {
            destPath = destPath.replace('/SaksOff5thStorefront', '/');
            putFile(absLocalPath, destPath, callback);
        }
    }
    catch(e){
        if (e.errno === 34 && destPath !== remote){
            deleteItem(destPath, callback);
        }
        grunt.log.writeln(e);
    }
  }

  function deleteItem(destPath, callback){
      request.del(destPath).on('response', function(res){
        grunt.log.writeln('File or Directory that was being watched was no longer found in local files')
        grunt.log.writeln('Deleting from remote server at ' + destPath)
        grunt.log.writeln('Server returned ' + res.statusCode );
        callback(destPath);
      });
  }

  function putFile(filePath, destPath, callback){
      fs.createReadStream(filePath).pipe(request.put(destPath).on('response',
          function(response){
              grunt.log.writeln( 'Writing to ' + destPath );
              grunt.log.writeln('Server returned ' + response.statusCode);
              callback(destPath);
          }));    
  }

  function postDir(dirPath, destPath, sharedPath, lrcallback){
      var options = {
                      url: destPath,
                      method: 'MKCOL'
                  };
      function callback (err, response, body){
          if (!err && response.statusCode == 200) {
              grunt.log.writeln('Folder created at ' + destPath);
          }else{
              grunt.log.writeln('Status code: ' + response.statusCode);
          }
      }
      grunt.log.writeln('New directory found at ' + dirPath + '. Writing.');
      request(options, callback);
      postDirContents(dirPath, lrcallback);
  }

  function postDirContents(dirPath, callback){
      grunt.log.writeln('Posting directory contents...');
      walk(dirPath, function(path, stat){
          grunt.log.writeln('found file or directory at ' + path + '...');
          var sharedPath = path.substring(localPath.length);
          syncChange(sharedPath, remote, localPath, callback);
      });
  }

  function findReloadPaths(){
    console.log('... looking for files to livereload ...');
    lrPaths = findGlobPaths(lrPaths);
    console.log('... found ' + lrPaths.length + ' files ...');
  }

  function findGlobPaths (arr){
    var globOptions = {
      dot: true,
      matchBase: true,
      cwd: localPath
    };

    var globs = [];
    var idxs  = [];

    arr.forEach(function(v, i){
      if (glob.hasMagic(v, globOptions) === true){
        idxs.push(i);
      }
    })

    idxs.forEach(function(v){
      globs.push(arr[v]);
    })

    arr = arr.filter(function(v){
      return glob.hasMagic(v, globOptions) === false;
    })

    globs.forEach(function(v, i){
      var matches = glob.sync(v, globOptions);
      matches.forEach(function(value, idx){
        if (arr.indexOf(value) === -1) {
          arr.push(value);
        }
      })

    });
    return arr;
  };

};