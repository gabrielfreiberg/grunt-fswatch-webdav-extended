# grunt-fswatch-webdav-extended

> Syncs and livereloads local updates files with a WebDAV configuration. Extending functionality from grunt-fswatch-webdav.

## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-fswatch-webdav-extended --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-fswatch-webdav-extended');
```

## The "fswatch_webdav_extended" task

### Overview
In your project's Gruntfile, add a section named `fswatch_webdav_extended` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  fswatch_webdav_extended: {
    target: {
      options: {
        password: 'password', //host password
        userName: 'username', //host username
        host: 'subdomain.domain/webdav/Sites/Cartridges/', //WebDAV folder base URL
        ignore_remotes: ['New_Version', 'version'], //[optional] String or Array of strings containing version/folder/catridge names to ignore
        ignored_files: ['node_modules/**/*', '.DS_Store'], //[optional] Specify files to ignore from the WebDAV sync watch list. Uses Grunt's file syntax
        cartridge: 'cartridge' //[optional] Custom target cartridge/folder name in case you want to overwrite default name lookup 
      },
      files: {
        src: ['path/to/files/**/*.isml',  'path/to/other/files/css/*.css'] //List of files to livereload
      }
    }
  },
});
```

## Release History
_(Nothing yet)_
