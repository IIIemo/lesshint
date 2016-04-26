'use strict';

var configLoader = require('./config-loader');
var minimatch = require('minimatch');
var merge = require('lodash.merge');
var linter = require('./linter');
var path = require('path');
var fs = require('vow-fs');
var Vow = require('vow');

var Lesshint = function () {

};

Lesshint.prototype.checkDirectory = function (checkPath) {
    return fs.listDir(checkPath).then(function (files) {
        files = files.map(function (file) {
            var fullPath = checkPath + '/' + file;

            return fs.stat(fullPath).then(function (stats) {
                if (stats.isDirectory()) {
                    return this.checkDirectory(fullPath);
                }

                // Check if the file should be excluded
                if (this.isExcluded(fullPath)) {
                    return [];
                }

                // Check if the file has the correct extension
                if (!this.hasAllowedExtension(file)) {
                    return [];
                }

                return this.checkFile(fullPath);
            }, this);
        }, this);

        return Vow.all(files).then(function (results) {
            return [].concat.apply([], results);
        });
    }, this);
};

Lesshint.prototype.checkFile = function (checkPath) {
    return fs.read(checkPath, 'utf8').then(function (data) {
        return this.checkString(data, checkPath);
    }, this);
};

Lesshint.prototype.checkPath = function (checkPath) {
    return fs.stat(checkPath).then(function (stats) {
        if (stats.isDirectory()) {
            return this.checkDirectory(checkPath);
        }

        return this.checkFile(checkPath);
    }, this);
};

Lesshint.prototype.checkString = function (input, checkPath) {
    var self = this;

    return new Promise(function (resolve, reject) {
        var checker = linter.lint(input, checkPath, self.config);

        checker.then(function (results) {
            resolve(results);
        });

        checker.catch(function (error) {
            var results;

            if (error.name !== 'CssSyntaxError') {
                /**
                 * Unkown error, i.e. not thrown by PostCSS.
                 * Reject and let someone else handle it.
                 */
                reject(error);
                return;
            }

            // We just emit parse errors as regular errors
            results = [{
                column: error.column,
                file: path.basename(checkPath),
                fullPath: checkPath,
                line: error.line,
                linter: 'parse error',
                message: error.reason,
                severity: linter.resultSeverity.error
            }];

            resolve(results);
        });
    });
};

Lesshint.prototype.configure = function (config) {
    var defaultConfig = configLoader(__dirname + '/config/defaults.json');

    this.config = merge(defaultConfig, config);
};

Lesshint.prototype.hasAllowedExtension = function (file) {
    var fileExtensions;

    if (!Array.isArray(this.config.fileExtensions) || this.config.fileExtensions === '*') {
        return true;
    }

    // Make sure there is a leading dot
    fileExtensions = this.config.fileExtensions.map(function (extension) {
        return '.' + extension.replace(/^\./, '');
    });

    return fileExtensions.indexOf(path.extname(file)) !== -1;
};

Lesshint.prototype.isExcluded = function (checkPath) {
    return this.config.excludedFiles.some(function (pattern) {
        return minimatch(checkPath, pattern, {
            matchBase: true
        });
    });
};

module.exports = Lesshint;
