var express = require('express');
var router = express.Router();
var config = require('../config.json');

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('indexview');
});
router.get('/downloads/:file(*)', function(req, res, next){ // this routes all types of file
    console.log("bajando");
    var path=require('path');
    var file = req.params.file;
    var dir = config.rec_dir.trim();
    if (!dir.endsWith('/'))
        dir = dir + '/';
    var path = path.resolve(dir+file);
    res.download(path); // magic of download fuction
});
 
module.exports = router;