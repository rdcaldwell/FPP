var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var graph = require('fbgraph');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var d3 = require('d3');
var async = require('async');
var jsonfile = require('jsonfile')

var index = require('./routes/index');
var users = require('./routes/users');

var app = express();

var conf = {
    client_id:      '1919389791629971',
    client_secret:  '80be2190b9b77e62ca6bad942891415e',
    scope:          'manage_pages, business_management',
    // You have to set http://localhost:3000/ as your website
    // using Settings -> Add platform -> Website
    redirect_uri:   'http://localhost:3000/auth'
};

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);

app.get('/auth', function(req, res) {
    if (!req.query.code) {
        var authUrl = graph.getOauthUrl({
            "client_id":     conf.client_id
            , "redirect_uri":  conf.redirect_uri
            , "scope":         conf.scope
        });

        if (!req.query.error) {
            res.redirect(authUrl);
        } else {
            res.send('access denied');
        }
    }
    else {
        console.log(req.query.code);
        graph.authorize({
            "client_id":      conf.client_id,
            "redirect_uri":   conf.redirect_uri,
            "client_secret":  conf.client_secret,
            "code":           req.query.code
        }, function (err, facebookRes) {
            res.redirect('/d3');
        });
    }
});

app.get('/graph', function(req, res) {
    var root_page_id = req.query.page_id;
    var pages = [];
    //var root_page_id = "153080620724";
    var jsonData = {
        "nodes": [],
        "links": []
    };

    graph.get(root_page_id + "?fields=id,name,likes,picture,category,website,is_published", function(err, reply) {
        if (err) {
            res.redirect('/d3?error=' + encodeURIComponent("Facebook page not found"));
        }

        jsonData.root = {
            "name":    reply.name,
            "picture":  reply.picture.data.url,
            "category": reply.category,
            "website":  reply.website
        }

        if (reply.hasOwnProperty('likes')) {
            pages.push(reply.id);

            for (var i in reply.likes.data)
                pages.push(reply.likes.data[i].id);

            async.forEachOf(pages, function (page, key, callback) {
                graph.get(page + "?fields=id,name,likes,picture", function (err, reply2) {
                    jsonData.nodes.push({
                        "id":       reply2.id,
                        "name":     reply2.name,
                        "picture":  reply2.picture.data.url
                    });

                    if (reply2.hasOwnProperty('likes')) {
                        for (var x in reply2.likes.data) {
                            if (pages.indexOf(reply2.likes.data[x].id) > -1) {
                                jsonData.links.push({
                                    "source": page,
                                    "target": reply2.likes.data[x].id
                                });
                            }
                        }
                    }
                    else {
                        jsonData.links.push({
                            "source": page,
                            "target": reply2.id
                        });
                    }

                    callback();
                })
            }, function (err) {
                // if any of the file processing produced an error, err would equal that error
                if (err) {
                    // One of the iterations produced an error.
                    // All processing will now stop.
                    console.error(err);
                    res.redirect('/d3');
                } else {
                    jsonfile.writeFile('./public/json/jsonData.json', jsonData, function (err) {
                        console.error(err)
                        res.render('fbd3', {
                            title: jsonData.root.name + "'s Network Graph",
                            name: jsonData.root.name,
                            picture: jsonData.root.picture,
                            category: jsonData.root.category,
                            website:  jsonData.root.website,
                            nodeCount: jsonData.nodes.length,
                            edgeCount: jsonData.links.length
                        });
                    });
                }
            });
        }
        else if (reply.is_published = "1") {
            jsonData.nodes.push({
                "id":       reply.id,
                "name":     reply.name,
                "picture":  reply.picture.data.url
            });

            jsonfile.writeFile('./public/json/jsonData.json', jsonData, function (err) {
                console.error(err)
                res.render('fbd3', {
                    title: jsonData.root.name + "'s Network Graph",
                    name: jsonData.root.name,
                    picture: jsonData.root.picture,
                    category: jsonData.root.category,
                    website:  jsonData.root.website,
                    nodeCount: jsonData.nodes.length,
                    edgeCount: jsonData.links.length
                });
            });
        }
        else res.redirect('/d3');

    });

});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

process.on('uncaughtException', function (err) {
    console.log(err);
});

var port = process.env.PORT || 3000;

app.listen(port, function() {
    console.log("Express server listening on port %d", port);
});

module.exports = app;

