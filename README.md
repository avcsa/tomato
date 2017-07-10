# tomato
free mpegts generator &amp; recorder

## what is this?
tomato is a node.js web app that will take one input and generate one mpegts over udp output and <i>n</i> recordings

## prerequisites
melt, ffmpeg, node.js, npm
```bash
sudo apt-get install melt ffmpeg nodejs npm
```

## configuration
config.json is the configuration file, you may edit it at will
* port: port where the server will be listening
* ipv4_address: the ipv4 address of the server where tomato is running
* rec_dir: the folder where recordings are going to be saved
* watch_interval: the time in seconds to check recording file size in order to close it and generate a new one (in seconds)
* rec_timeout: how much time to wait for the udp to continue producing output in order to close the recordings (in microseconds)
* autostart: if the server should start the stream on init or it will be manually started

## input
input.json is where you can configure your input source (you may also do this via the web app)
* profile: melt profile (see the output of ```melt -query profile```)
* source: your input (it can be any of melt producers -> https://www.mltframework.org/plugins/PluginsProducers/)

## output
output.json is where you can configure the output ts (you may also do this via the web app)
* address: multicast or unicast ip for the stream
* port: port for the stream
* muxrate: desired muxing bitrate, in bits/s
* bufsize: buffer size, in in bits/s
* vb: video bitrate, in bits/s or use k or M sufix
* ab: audio bitrate, in bits/s or use k or M sufix
* minrate: minumum bitrate tolerance, in bits/s or use k or M sufix -> https://superuser.com/questions/536001/variable-bit-rates-with-vb-and-minrate-maxrate-settings-in-ffmpeg
* maxrate: maximum bitrate tolerance, in bits/s or use k or M sufix -> https://superuser.com/questions/536001/variable-bit-rates-with-vb-and-minrate-maxrate-settings-in-ffmpeg
* vcodec: video codec to use
* acodec: audio codec to use
* g: group of pictures (gop)
* bf: maximum number of B-frames
* threads: threads to use for enconding
* real_time: if it is a real time encoding
* crf: constant rate factor -> https://trac.ffmpeg.org/wiki/Encode/H.264#crf

## recordings
record.json is the template for generating recordings
* prefix: file name prefix
* format: mp4 or ts at the time
* bitrate: video bitrate in bits/s or use k or M sufix
* maxsize: maximum size of file, in bytes or use k, M or G sufix (tomato will generate a new file when current file reach this limit)
* enabled: if this recording is enabled or not

## starting
clone it ```git clone https://github.com/avcsa/tomato.git```
cd into it ```cd tomato```
install dependencies ```npm install```
run it ```node app.js```

## gui
* on the server, enter http://localhost:4200 (or whatever port you choose in config) and you will find the gui
* you can start or stop the stream making click on the upper right button (Stopped/Running)
* if running, you will see fps on this button too
* recordings enabled will start as soon as the stream start and will end when the stream stops
* start and stop manually a recording by changing enabled (yes/no)
* editing a input or output prop will make the stream to stop and start again
* editint a running record will not take effect until its restarted
* deleting a recording will stop it first and then remove it without confirmation (you will not loose any recording file)
* on the files card you can view, download or delete any recording file (no confirmation dialog, be careful deleting!)

## license
[GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.html)

## support
Please open an issue!
