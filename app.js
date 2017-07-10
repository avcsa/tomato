var express = require('express');  
var app = express();  
var server = require('http').createServer(app);  
var io = require('socket.io')(server);
var expressHandlebars = require('express-handlebars');
var index = require('./routes/index');
var path = require('path');
var spawn = require('child_process').spawn;
var SelfReloadJSON = require('self-reload-json');
var fs = require('fs');
var Glob = require('glob-fs');
var _ = require('underscore');
var uuidv4 = require('uuid/v4');
var moment = require('moment');
var fsw = require('file-size-watcher');

var record = require('./record.json');

var self = this;

self.config = require('./config.json');

self.input = new SelfReloadJSON(__dirname + '/input.json');
self.output = new SelfReloadJSON(__dirname + '/output.json');

self.status = {};
self.frame = 0;
self.frameAnt = 0;
self.recFiles = [];

//// VER QUE PASA CUANDO EL STREAM SE ACABA SIN INTERVENCION DEL USUARIO (STREAM Y RECORDINGS)

var glob = new Glob({ gitignore: true });

var rf = glob.readdirSync(self.config.rec_dir + "/*");
if (rf.length) {
    _.each(rf, function(file) {
        var f = {};
        var idx = file.lastIndexOf('/') + 1;
        f.filename = file.substring(idx);
        f.running = false;
        self.recFiles.push(f);
    });
}

self.status.running = false;
self.status.server = "http://" + self.config.ipv4_address + ":" + self.config.port;

self.recordings = [];
self.runningRecordings = [];
self.aliveRecordings = [];

self.maxRecording = 0;

self.createNewRecording = function(callback) {
    self.maxRecording++;
    var recordx = _.clone(record);
    recordx.format = record.format[0];
    recordx.enabled = record.enabled[0];
    recordx.uuid = uuidv4();
    fs.writeFileSync('./record-' + self.maxRecording + '.json', JSON.stringify(recordx));
    self.recordings.push(new SelfReloadJSON(__dirname + '/record-' + self.maxRecording + '.json'));
    if (callback)
        callback();
};

glob = new Glob({ gitignore: true });

var files = glob.readdirSync('**/record-*.json');

if (files.length === 0) {
    self.createNewRecording();
} else {
    _.each(files, function(item) {
        var ext = item.indexOf('.json');
        var nr = parseInt(item.substring(7, ext++));
        if (self.maxRecoring < nr);
            self.maxRecording = nr;
        self.recordings.push(new SelfReloadJSON(__dirname + '/' + item));
    });
}

app.locals.status = self.status;
app.locals.input = self.input;
app.locals.output = self.output;
app.locals.record = self.record;
app.locals.recordings = self.recordings;
app.locals.files = self.recFiles;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
//Helper is used to ease stringifying JSON
app.engine('handlebars', expressHandlebars(
        {
            helpers: {
                toJSON : function(object) {
                    return JSON.stringify(object);
                },
                recordingRunning: function(enabled, options) {
                    var result = self.status.running;
                    if (result) 
                        result = (enabled === 'yes');
                    
                    if (result) {
                        return options.fn(this);
                    } else {
                        return options.inverse(this);
                    }
                },
                compare : function (lvalue, operator, rvalue, options) {
                    var operators, result;
    
                    if (arguments.length < 3) {
                        throw new Error("Handlerbars Helper 'compare' needs 2 parameters");
                    }
    
                    if (options === undefined) {
                        options = rvalue;
                        rvalue = operator;
                        operator = "===";
                    }
    
                    operators = {
                        '==': function (l, r) { return l == r; },
                        '===': function (l, r) { return l === r; },
                        '!=': function (l, r) { return l != r; },
                        '!==': function (l, r) { return l !== r; },
                        '<': function (l, r) { return l < r; },
                        '>': function (l, r) { return l > r; },
                        '<=': function (l, r) { return l <= r; },
                        '>=': function (l, r) { return l >= r; },
                        'typeof': function (l, r) { return typeof l == r; }
                    };
    
                    if (!operators[operator]) {
                        throw new Error("Handlerbars Helper 'compare' doesn't know the operator " + operator);
                    }
    
                    result = operators[operator](lvalue, rvalue);
    
                    if (result) {
                        return options.fn(this);
                    } else {
                        return options.inverse(this);
                    }

                }
            },
            defaultLayout: 'main'
        }));
app.set('view engine', 'handlebars');

app.use(express.static(__dirname + '/node_modules'));

app.use('/', index);

//Routing To Public Folder For Any Static Context
app.use(express.static(__dirname + '/public'));
app.use(express.static(path.resolve(self.config.rec_dir)));

app.use('/static', express.static(__dirname + '/public'));
app.use('/videos', express.static(path.resolve(self.config.rec_dir)));

server.listen(self.config.port);

io.on('connection', function(client) {  
    console.log('Client connected');

    client.on('join', function(data) {
        console.log(data);
        client.emit("init", self.status);
    });
    client.on('startPlaying', function(data) {
        self.startPlaying();
    });
    client.on('stopPlaying', function(data) {
        self.stopPlaying();
    });
    client.on('createNewRecording', function() {
        self.createNewRecording(function() {
            io.sockets.emit('newRecording', _.last(self.recordings));
        });
    });
    client.on('updateValue', function(data) {
        if (data.type === 'input') {
            for (var key in self.input) {
                if (key === data.item) {
                    self.input[key] = data.valor;
                    self.input.save();
                }
            }
        } else if (data.type === 'output') {
            for (var key in self.output) {
                if (key === data.item) {
                    self.output[key] = data.valor;
                    self.output.save();
                }
            }
        } else if (data.type === 'record') {
            _.each(self.recordings, function(item) {
                if (item.uuid === data.uuid) {
                    for (var key in item) {
                        if (key === data.item) {
                            item[key] = data.valor;
                            item.save();
                            if (data.item === "enabled") {
                                if (data.valor === "yes")
                                    self.startRecording(item);
                                else
                                    self.stopRecordingByUuid(data.uuid);
                            }
                        }
                    }
                }
            });
        }
        io.sockets.emit('dataChanged', data);
        if (data.type !== "record") {
            if (self.status.running) {
                self.stopPlaying();
                self.startPlaying();
            }
        }
    });
    client.on('deleteRecording', function(uuid) {
        self.deleteRecording(uuid);
    });
    client.on('removeRecordingFile', function(filename) {
        self.removeRecordingFile(filename);
    });
});

self.startPlaying = function() {
    self.status.running = true;
//    app.locals.status = self.status;
    io.sockets.emit('statusChanged', self.status);
    var opt = {};
//    opt.detached = true;
//    opt.shell = true;
    self.melt = spawn('melt', ['-profile', self.input.profile, self.input.source, '-consumer', 'avformat:udp://' + self.output.address 
                + ':' + self.output.port + '?pkt_size=1316', 'f=mpegts', 'muxrate=' + self.output.muxrate,
                'bufsize=' + self.output.bufsize, 'vb=' + self.output.vb, 'ab=' + self.output.ab, 'minrate=' + self.output.minrate, 
                'maxrate=' + self.output.maxrate, 'vcodec=' + self.output.vcodec, 'acodec=' + self.output.acodec, 'g=' + 
                self.output.g, 'bf=' + self.output.bf, 'threads=' + self.output.threads, 'real_time=' + self.output.real_time, 
                'crf=' + self.output.crf], opt);
    console.log("Starting stream with PID " + self.melt.pid);
    self.melt.stdout.on('data', function(data){
        console.log("OUT:" + data);
    });
    self.melt.stderr.on('data', function(data){
        if (!('' + data).startsWith("Current Frame"))
            console.log("ERR:" + data);
        else
            self.frame = parseInt(('' + data).substring(14,25).trim());
    });
    self.melt.on('close', function(code, signal){
        console.log('Stream stopped with code ' + code + ' and signal ' + signal);
        self.status.running = false;
        io.sockets.emit('statusChanged', self.status);
        self.frame = 0;
        self.frameAnt = 0;
        self.stopAllRecordings(function() {
            clearInterval(self.interval);
            self.interval = 0;
        });
    });
    self.interval = setInterval(function() {
        if (self.frameAnt) {
            var frames = self.frame - self.frameAnt;
            if (frames < 0) frames = 0;
            io.sockets.emit('fps', frames);
            self.frameAnt = self.frame;
        } else {
            self.frameAnt = self.frame;
        }
    }, 1000);
    self.startAllRecordings();
};

self.stopPlaying = function() {
    self.stopAllRecordings(function() {
        console.log("Stopping stream with PID " + self.melt.pid);
        self.melt.kill('SIGKILL');
        clearInterval(self.interval);
        self.interval = 0;
    });
};

self.startAllRecordings = function() {
    _.each(_.where(self.recordings, {"enabled": "yes"}), function(item) {
        self.startRecording(item);
    });
};

self.stopAllRecordings = function(callback, kill) {
    if (self.runningRecordings.length) {
        self.stopRecording(self.runningRecordings[self.runningRecordings.length - 1], kill);
        setTimeout(self.stopAllRecordings, 500, callback);
    } else {
        if (callback) 
            callback();
    }
};

self.startRecording = function(rec) {
    var uuid = rec.uuid;
    if (!self.status.running)
        return;
    var filename = self.config.rec_dir.trim();
    if (!fs.existsSync(filename))
        fs.mkdirSync(filename);
    if (!filename.endsWith('/'))
        filename = filename + '/' + rec.prefix.trim();;
    filename = filename + moment().format('YYYYMMDDHHmmssSSSSSSSSS') + '.' + rec.format;
    var params = ['-f', 'mpegts', '-i', 'udp://' + self.output.address + ':' + self.output.port + '?fifo_size=1000000&overrun_nonfatal=1&timeout=' + self.config.rec_timeout, '-strict', '-2'];
    if (rec.bitrate) {
        params.push('-b:v');
        params.push(rec.bitrate);
    }
    params.push(filename);
    var recording = spawn('ffmpeg', params);
    console.log("Starting recording [" + uuid + "] with PID " + recording.pid);
    recording.stdout.on('data', function(data){
        console.log("OUT:" + data);
    });
    recording.stderr.on('data', function(data){
        if (!('' + data).startsWith("frame="))
            console.log("ERR:" + data);
        else
            self.keepRecAlive(uuid);
    });
    recording.on('close', function(code, signal){
        console.log('Recording [' + uuid + '] stopped with code ' + code + ' and signal ' + signal);
        io.sockets.emit('recStatusChanged', {"running": false, "uuid": uuid});
        var idx = filename.lastIndexOf('/') + 1;
        var f = filename.substring(idx);
        var recfile = _.findWhere(self.recFiles, {"filename": f});
        recfile.running = false;
        app.locals.files = self.recFiles;
        io.sockets.emit('recordedEnded', f);
        self.stopWatchingRec(uuid);
    });
    var watcher = fsw.watch(filename, self.config.watch_interval);
    watcher.on('sizeChange', function(newSize, oldSize) {
        var unit = rec.maxsize.substring(rec.maxsize.length - 1).toLowerCase();
        var maxsize = parseInt(rec.maxsize.substring(0, rec.maxsize.length - 1));
        if (unit === 'g')
            maxsize = maxsize * 1073741824;
        else if (unit === 'm')
            maxsize = maxsize * 1048576;
        else if (unit === 'k')
            maxsize = maxsize * 1024;
        if (newSize >= maxsize) {
            watcher.stop();
            console.log("File " + filename + " reached " + maxsize + " limit. Restaring...");
            _.each(self.recordings, function(item) {
                if (item.uuid === rec.uuid) {
                    var oldUuid = uuid;
                    item.uuid = uuidv4();
                    item.save();
                    console.log("New uuid: " + item.uuid);
                    console.log("Old uuid: " + oldUuid);
                    io.sockets.emit('newRecording', item);
                    self.startRecording(item);
                    setTimeout(self.deleteRecording, 1000, oldUuid);
                }
            });
        }
    });
    self.runningRecordings.push({"uuid": uuid, "rec": recording, "file": filename, "watcher": watcher});
    io.sockets.emit('recStatusChanged', {"running": true, "uuid": uuid});
    var idx = filename.lastIndexOf('/') + 1;
    var f = filename.substring(idx);
    io.sockets.emit('newRecordingFile', {"uuid": uuidv4(), "filename": f});
    self.recFiles.push({"running": true, "filename": f});
    app.locals.files = self.recFiles;
};

self.stopRecording = function(rec, kill) {
    console.log("Stopping recording[" + rec.uuid + "] with PID " + rec.rec.pid);

    rec.watcher.stop();
    if (kill)
        rec.rec.kill('SIGKILL');
    else
        rec.rec.stdin.write('q');

    self.runningRecordings = _.filter(self.runningRecordings, function(item) {
        return (item.uuid !== rec.uuid);
    });
};

self.stopRecordingByUuid = function(uuid, kill) {
    _.each(self.runningRecordings, function(item) {
        if (item.uuid === uuid)
            self.stopRecording(item, kill);
    });
};

self.keepRecAlive = function(uuid) {
    var rec = _.findWhere(self.aliveRecordings, {"uuid": uuid});
    if (!rec) {
        rec = {"uuid": uuid, "time": moment()};
        self.aliveRecordings.push(rec);
        io.sockets.emit('recRunning', uuid);
    } else {
        rec.time = moment();
    }
};

self.stopWatchingRec = function(uuid) {
    var rec = _.findWhere(self.aliveRecordings, {"uuid": uuid});
    if (rec) {
        self.aliveRecordings = _.filter(self.aliveRecordings, function(item) {
            return (item.uuid !== uuid);
        });
        io.sockets.emit('recStopped', uuid);
    }
};

self.deleteRecording = function(uuid) {
    console.log("Deleting recording [" + uuid + "]");
    self.stopRecordingByUuid(uuid);
    var rec = _.findWhere(self.recordings, {"uuid": uuid});
    if (rec) {
        self.recordings = _.filter(self.recordings, function(item) {
            return (item.uuid !== rec.uuid);
        });
        app.locals.recordings = self.recordings;
        rec.stop();
        var internal = Object.getOwnPropertySymbols(rec)[0];
        var filename = rec[internal].fileName;
        fs.unlinkSync('./' + filename);
    }
    io.sockets.emit('recDeleted', uuid);
};

self.removeRecordingFile = function(filename) {
    self.recFiles = _.filter(self.recFiles, function(item) {
        return (item.filename !== filename);
    });
    app.locals.files = self.recFiles;
    var dir = self.config.rec_dir.trim();
    if (!dir.endsWith('/'))
        dir = dir + '/';
    fs.unlinkSync(dir + filename);
    io.sockets.emit('recordingFileRemoved', filename);
};

setInterval(function() {
    _.each(self.aliveRecordings, function(item) {
        var ago = moment().subtract(1, 'seconds');
        if (item.time.isBefore(ago))
            self.stopWatchingRec(item.uuid);
    });
}, 1000);

if (self.config.autostart)
    self.startPlaying();