var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Facebook Page Network' });
});

router.get('/d3', function(req, res, next) {
    res.render('d3', { title: 'Facebook Page Network', message: req.query.error });
});

module.exports = router;
