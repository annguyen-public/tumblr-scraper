'use strict';

var logSymbols = require('log-symbols');
var clivas = require('clivas');
var filesize = require('filesize');
var fs = require('fs');
var _ = require('lodash');

var TumblrScraperCliView = function(blogStream, downloader) {
  this.blog = blogStream;
  this.downloader = downloader;

  this.fsStatCache = {};
  this.drawTimer = null;
  this.lastDrawEvent = 0;
  this.firstDrawEvent = 0;
};

/**
 * Sets up the render loop for drawing.
 */
TumblrScraperCliView.prototype.renderLoop = function() {
  var that = this;
  this.firstDrawEvent = Date.now();

  // Clear the screen.
  process.stdout.write(new Buffer('G1tIG1sySg==', 'base64'));
  this.loop = setInterval(function() {that.draw();}, 1000);
  this.draw();

  this.downloader.on('finish', function() {
    that.stopRenderLoop();
  });

  // Fire two draw events after a file has been downloaded.
  this.downloader.on('fileDownloaded', function() {
    // Rate limit draw event to one per 100ms to avoid blinking.
    if (that.lastDrawEvent + 100 > Date.now()) {
      return;
    }

    that.draw();
    clearTimeout(that.drawTimer);

    // Wait for the fsStatCache to be populated.
    that.drawTimer = setTimeout(function() {that.draw();}, 10);
  });

};

TumblrScraperCliView.prototype.stopRenderLoop = function() {
  var that = this;

  clearInterval(this.loop);

  // Schedule one final draw to show the filesize of the last items.
  setTimeout(function(){that.draw();}, 100);
  this.draw();
};

/**
 * Render a line for an image status.
 *
 * @see TumblrScraper.status
 */
TumblrScraperCliView.prototype.drawStatusLine = function(item) {
  switch (item.status) {
    case 'skipped':
      clivas.line('  ' + logSymbols.warning + ' {64:' + item.path + '} (skipped)');
      break;

    case 'error':
      clivas.line('  ' + logSymbols.error + ' ' + item.image + ' (' + item.error + ')');
      break;

    default:
      // Load file size asynchronously.
      var that = this;
      fs.stat(item.path, function writeFsStatCache(err, stat) {
        that.fsStatCache[item.path] = stat.size;
      });

      var statResult = '';
      if (this.fsStatCache[item.path] !== undefined) {
        statResult = '{yellow:' + filesize(this.fsStatCache[item.path]) + '}';
      }

      clivas.line('  ' + logSymbols.success + ' {64:' + item.path + '} ' + statResult);
  }
};

/**
 * Callback to draw the cli output.
 */
TumblrScraperCliView.prototype.draw = function() {
  var that = this;
  this.lastDrawEvent = Date.now();
  clivas.clear();

  // Header.
  clivas.line(this.getHeader());
  clivas.line(this.getDownloadedStats());

  // Status lines.
  var fromLines = this.downloader.status.length - clivas.height + 3;
  if (fromLines > 0) {
    clivas.line(' ...');
    fromLines++;
  }

  _.tail(this.downloader.status, fromLines).forEach(function drawStatusLine(item) {
    that.drawStatusLine(item);
  });
};

TumblrScraperCliView.prototype.getDownloadedStats = function() {
  var stats = '';
  if (this.blog.images !== undefined) {
    var symbol = (this.blog.images === 0 ) ? logSymbols.warning : logSymbols.info;
    stats += symbol + ' Downloaded {green:' + this.downloader.status.length + '}/{green:' + this.blog.images + '}';
  }

  var sum = _.reduce(this.fsStatCache, function(sum, num) {
    return sum + num;
  });

  if (sum !== undefined) {
    var elapsedTime = Date.now() - this.firstDrawEvent;
    stats += "  Sum: {green:" + filesize(sum) + "}";
    stats += "  Avg. speed: {green:" + filesize(sum/elapsedTime*1000) + "/s}";
  }

  return stats;
};

TumblrScraperCliView.prototype.getHeader = function() {
  var header = logSymbols.info;

  header += ' Blog: {green:' + this.blog.options.blog + '}';
  if (this.blog.options.tag !== '') {
    header += '  Tag: {green:' + this.blog.options.tag + '}';
  }

  if (!this.blog.finished) {
    header += '  Page: {green:' + this.blog.page + '}';
  }

  return header;
};

module.exports = TumblrScraperCliView;
