var express = require('express');
var router = express.Router();
var graph = require('fbgraph');
var async = require('async');
var User = require('../models/user');

var config = {
    client_id:      '1919389791629971',
    client_secret:  '80be2190b9b77e62ca6bad942891415e',
    scope:          'manage_pages, business_management',
    // You have to set http://localhost:3000/ as your website
    // using Settings -> Add platform -> Website
    redirect_uri:   'http://localhost:3000/auth'
};

module.exports = function(session) {
    /* GET home page. */
    router.get('/', function (req, res, next) {
        if (req.session.user_id == null)
            res.redirect('/login');
        else
            User.findOne({'id': req.session.user_id}, function (err, user) {
                res.render('index', {
                    title: 'Facebook Page Network',
                    error: req.query.error,
                    id: req.session.user_id,
                    name: req.session.username,
                    picture: req.session.userPicture,
                    graphs: user.graphs || null,
                });
            });
    });

    router.get('/login', function (req, res, next) {
        res.render('login', {
            title: 'Facebook Page Network'
        });
    });

    router.get('/search', function (req, res, next) {
        res.render('search', {
            title: 'Facebook Page Network',
            id: req.session.user_id,
            name: req.session.username,
            picture: req.session.userPicture,
            searchError: req.query.error
        });
    });

    router.get('/auth', function (req, res) {
        if (!req.query.code) {
            var authUrl = graph.getOauthUrl({
                "client_id": config.client_id
                , "redirect_uri": config.redirect_uri
                , "scope": config.scope
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
                "client_id": config.client_id,
                "redirect_uri": config.redirect_uri,
                "client_secret": config.client_secret,
                "code": req.query.code
            }, function (err, fbres) {
                graph.get("me?fields=id,name,picture", function (err, reply) {
                    // find the user in the database based on their facebook id
                    User.findOne({'id': reply.id}, function (err, user) {
                        // if there is an error, stop everything and return that
                        // ie an error connecting to the database
                        if (err) console.log(err);

                        // if the user is found, then log them in
                        if (user) {
                            console.log("user found");
                        } else {
                            // if there is no user found with that facebook id, create them
                            var newUser = new User();

                            // set all of the facebook information in our user model
                            newUser.id = reply.id; // set the users facebook id
                            newUser.name = reply.name;

                            // save our user to the database
                            newUser.save(function (err) {
                                if (err) throw err;
                                console.log("new user inserted");
                            });

                        }
                    });

                    req.session.username = reply.name;
                    req.session.userPicture = reply.picture.data.url;
                    req.session.user_id = reply.id;

                    res.redirect('/');
                });
            });
        }
    });

    router.get('/insert', function (req, res) {
        var isInserted = false;
        User.findOne({'id': req.session.user_id}, function (err, user) {
            for (var i = 0; i < user.graphs.length; i++) {
                if (user.graphs[i].graph_id == req.session.data.graph_id) {
                    isInserted = true;
                }
            }

            if (isInserted) {
                res.redirect('/render/' + req.session.data.graph_id);
            }
            else {
                user.graphs.push(req.session.data);

                user.save(function (err) {
                    if (err) {
                        res.redirect('/render/' + req.session.data.graph_id + '?save_error=' + encodeURIComponent("Graph could not be inserted"));
                    }
                    else {
                        res.redirect('/render/' + req.session.data.graph_id + '?success=' + encodeURIComponent("Graph successfully inserted"));
                    }

                    console.log("graph added");
                });
            }
        });

    });

    router.get('/remove/:id', function (req, res) {
        var page_id = req.params.id;

        User.findOneAndUpdate({id: req.session.user_id}, {$pull: {graphs: {graph_id: page_id}}}).exec();
        console.log("updated");
        res.redirect('/');
    });

    router.get('/render/:id', function (req, res) {
        var page_id = req.params.id;
        var graph = {};
        User.findOne({'id': req.session.user_id}, function (err, user) {
            for (var i = 0; i < user.graphs.length; i++) {
                if (user.graphs[i].graph_id == page_id) {
                    graph = user.graphs[i];
                }
            }

            if (graph.root) {
                res.render('render', {
                    title: graph.root.name,
                    id: req.session.user_id,
                    name: req.session.username,
                    picture: req.session.userPicture,
                    dataString: JSON.stringify(graph),
                    data: graph,
                    success: req.query.success,
                    error: req.query.error,
                    save_error: req.query.save_error,
                    isInserted: true
                });
            }
            else {
                res.render('render', {
                    title: req.session.data.root.name,
                    id: req.session.user_id,
                    name: req.session.username,
                    picture: req.session.userPicture,
                    dataString: JSON.stringify(req.session.data),
                    data: req.session.data,
                    success: req.query.success,
                    error: req.query.error,
                    save_error: req.query.save_error,
                    isInserted: true
                });
            }

        });
    });

    router.get('/graph', function (req, res) {
        var root_page_id = req.query.page_id;
        var category = req.query.category;
        var depth = req.query.depth;
        var likes = req.query.likes || 0;
        var pages = [];
        var jsonData = {
            "nodes": [],
            "links": []
        };

        graph.get(root_page_id + "?fields=id,name,likes,picture.type(large),category,website,is_published", function (err, reply) {
            if (err) {
                var backURL = req.header('Referer') || '/';
                if (backURL.indexOf("error") != -1) {
                    res.redirect(backURL);
                }
                else if (backURL.indexOf("?") != -1) {
                    res.redirect(backURL + '&error=' + encodeURIComponent("Facebook page not found"));
                }
                else {
                    res.redirect(backURL + '?error=' + encodeURIComponent("Facebook page not found"));
                }
            }

            jsonData.graph_id = reply.id;

            jsonData.root = {
                "name": reply.name,
                "id": reply.id,
                "picture": reply.picture.data.url,
                "category": reply.category,
                "website": reply.website
            }

            if (reply.hasOwnProperty('likes')) {
                pages.push(reply.id);

                async.forEachOf(reply.likes.data, function (page, key, callback) {
                    graph.get(page.id + "?fields=id,category,fan_count", function (err, response) {
                        if (category) {
                            if (reply.category == response.category && response.fan_count > likes) {
                                pages.push(response.id);
                            }
                        }
                        else if (response.fan_count > likes) {
                            pages.push(response.id);
                        }

                        callback();
                    });
                }, function (err) {
                    if (err) {
                        console.error(err);
                        res.redirect('/');

                    }
                    setDepth(jsonData, pages, reply.category, category, depth, likes, req, res)
                });
/*
                if (category) {
                    async.forEachOf(reply.likes.data, function (page, key, callback) {
                        graph.get(page.id + "?fields=id,category,fan_count", function (err, response) {
                            if (reply.category == response.category && response.fan_count > likes) {
                                pages.push(response.id);
                            }

                            callback();
                        });
                    }, function (err) {
                        if (err) {
                            console.error(err);
                            res.redirect('/');

                        }
                        setDepth(jsonData, pages, reply.category, category, depth, req, res)
                    });
                }
                else {
                    for (var i in reply.likes.data) {
                        pages.push(reply.likes.data[i].id);
                    }

                    setDepth(jsonData, pages, reply.category, category, depth, req, res)
                }*/
            }
            else if (reply.is_published = "1") {
                jsonData.nodes.push({
                    "id": reply.id,
                    "name": reply.name,
                    "picture": reply.picture.data.url
                });

                req.session.data = jsonData;

                res.render('render', {
                    title: jsonData.root.name,
                    id: req.session.user_id,
                    name: req.session.username,
                    picture: req.session.userPicture,
                    dataString: JSON.stringify(jsonData),
                    data: jsonData
                });
            }
        });

    });

    router.get('/graph/:id', function (req, res) {
        var root_page_id = req.params.id;
        var category = req.query.category;
        var depth = req.query.depth;
        var likes = req.query.likes || 0;

        if (category)
            res.redirect('/graph?page_id=' + root_page_id + '&depth=' + depth + '&category=' + category + "&likes=" + likes);
        else
            res.redirect('/graph?page_id=' + root_page_id + '&depth=' + depth + "&likes=" + likes);
    });

    return router;
}

function setDepth(jsonData, pages, root_category, query_category, depth, likes, req, res) {
    jsonData.category = query_category;
    if (likes > 0)
        jsonData.likes = likes;

    if (depth == "2") {
        jsonData.graph_id += "d2";
        jsonData.depth = "2";

        async.forEachOf(pages, function (page2, key, callback) {
            graph.get(page2 + "?fields=id,likes", function (err, response) {
                if (response.hasOwnProperty('likes')) {
                    async.forEachOf(response.likes.data, function (page3, key, cb) {
                        graph.get(page3.id + "?fields=id,category,fan_count", function (err, response2) {
                            if (query_category) {
                                if (root_category == response2.category && response2.fan_count > likes) {
                                    if (pages.indexOf(response2.id) == -1)
                                        pages.push(response2.id);
                                }
                            }
                            else if (response2.fan_count > likes){
                                if (pages.indexOf(response2.id) == -1)
                                    pages.push(response2.id);
                            }

                            cb();
                        });
                    }, function (err) {
                        if (err) {
                            console.error(err);
                            res.redirect('/');
                        }

                        callback();
                    });
                    /*
                    if (query_category) {
                        async.forEachOf(response.likes.data, function (page3, key, cb) {
                            graph.get(page3.id + "?fields=id,category", function (err, response2) {
                                if (root_category == response2.category) {
                                    if (pages.indexOf(response2.id) == -1)
                                        pages.push(response2.id);
                                }

                                cb();
                            });
                        }, function (err) {
                            if (err) {
                                console.error(err);
                                res.redirect('/');
                            }

                            callback();
                        });
                    }
                    else {
                        for (var i in response.likes.data) {
                            if (pages.indexOf(response.likes.data[i].id) == -1)
                                pages.push(response.likes.data[i].id);
                        }

                        callback();
                    }*/
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            if (err) {
                console.error(err);
                res.redirect('/');
            }

            getNodesAndEdges(jsonData, pages, req, res);
        });
    }
    else {
        jsonData.graph_id += "d1";
        jsonData.depth = "1";

        getNodesAndEdges(jsonData, pages, req, res);
    }

    if (query_category) {
        jsonData.graph_id += "c";
    }

    jsonData.graph_id += likes;
}

function getNodesAndEdges(jsonData, pages, req, res) {
    async.forEachOf(pages, function (page, key, callback) {
        graph.get(page + "?fields=id,name,likes,picture.type(large),category,fan_count", function (err, reply) {
            jsonData.nodes.push({
                "id": reply.id,
                "name": reply.name,
                "picture": reply.picture.data.url,
                "category": reply.category,
                "fan_count": reply.fan_count
            });

            if (reply.hasOwnProperty('likes')) {
                for (var x in reply.likes.data) {
                    if (pages.indexOf(reply.likes.data[x].id) > -1) {
                        jsonData.links.push({
                            "source": page,
                            "target": reply.likes.data[x].id
                        });
                    }
                }
            }
            else {
                jsonData.links.push({
                    "source": page,
                    "target": reply.id
                });
            }

            callback();
        });
    }, function (err) {
        if (err) {
            console.error(err);
            res.redirect('/');
        }

        req.session.data = jsonData;

        res.render('render', {
            error: req.query.error,
            title: jsonData.root.name,
            id: req.session.user_id,
            name: req.session.username,
            picture: req.session.userPicture,
            dataString: JSON.stringify(jsonData),
            data: jsonData
        });

    });
}

/*
 router.get('/graph', function(req, res) {
 var root_page_id = req.query.page_id;
 var category = req.query.category;
 var depth = req.query.depth;

 var pages = [];
 //var root_page_id = "153080620724";
 var jsonData = {
 "nodes": [],
 "links": []
 };

 graph.get(root_page_id + "?fields=id,name,likes,picture.type(large),category,website,is_published", function(err, reply) {
 if (err) {
 res.redirect('/?error=' + encodeURIComponent("Facebook page not found"));
 }
 jsonData.root = {
 "name":     reply.name,
 "id":       reply.id,
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
 res.redirect('/');
 } else {
 req.session.data = jsonData;
 res.render('render', {
 title: jsonData.root.name,
 id: req.session.user_id,
 name: req.session.username,
 picture: req.session.userPicture,
 success: req.query.success,
 error: req.query.error,
 dataString: JSON.stringify(jsonData),
 data: jsonData
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
 req.session.data = jsonData;
 res.render('render', {
 id: req.session.user_id,
 name: req.session.username,
 picture: req.session.userPicture,
 success: req.query.success,
 error: req.query.error,
 dataString: JSON.stringify(jsonData),
 data: jsonData
 });
 }
 else res.redirect('/');
 });
 });
 */