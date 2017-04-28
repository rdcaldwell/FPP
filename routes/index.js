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
    // Index page
    router.get('/', function (req, res, next) {
        // If the session does not have an active user id
        if (req.session.user_id == null)
            // Redirects to login page
            res.redirect('/login');
        else
            /*
                If the session has a user id, the id is queried in the database to
                return the current users data
             */
            User.findOne({'id': req.session.user_id}, function (err, user) {
                // Renders index page with all necessary data.
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

    // Login page
    router.get('/login', function (req, res, next) {
        // Renders login page with all necessary data.
        res.render('login', {
            title: 'Facebook Page Network'
        });
    });

    // Search page
    router.get('/search', function (req, res, next) {
        // Renders search page with all necessary data.
        res.render('search', {
            title: 'Facebook Page Network',
            id: req.session.user_id,
            name: req.session.username,
            picture: req.session.userPicture,
            searchError: req.query.error
        });
    });

    // OAuth
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

    // Insert to database
    router.get('/insert', function (req, res) {
        var isInserted = false;
        // The user id is queried in the database
        User.findOne({'id': req.session.user_id}, function (err, user) {
            // Searches the user's saved graphs to see if the graph already exists
            for (var i = 0; i < user.graphs.length; i++) {
                // If the graph existed, isInserted is true
                if (user.graphs[i].graph_id == req.session.data.graph_id) {
                    isInserted = true;
                }
            }

            // If isInserted is true
            if (isInserted) {
                // Redirect to render the current graph
                res.redirect('/render/' + req.session.data.graph_id);
            }
            else {
                // If the graph is not inserted, the graph is added to the users graphs
                user.graphs.push(req.session.data);

                // Update is saved
                user.save(function (err) {
                    // Notifies the user on the whether or not he graph was saved to the database
                    if (err) {
                        res.redirect('/render/' + req.session.data.graph_id + '?save_error=' + encodeURIComponent("Graph could not be inserted"));
                    }
                    else {
                        res.redirect('/render/' + req.session.data.graph_id + '?success=' + encodeURIComponent("Graph successfully inserted"));
                    }
                });
            }
        });

    });

    // Remove from database
    router.get('/remove/:id', function (req, res) {
        var page_id = req.params.id;

        // Queries the database using the user id, removing the graph id from the database
        User.findOneAndUpdate({id: req.session.user_id}, {$pull: {graphs: {graph_id: page_id}}}).exec();
        // Redirect to index
        res.redirect('/');
    });

    // Render graph from id
    router.get('/render/:id', function (req, res) {
        var page_id = req.params.id;
        var graph = {};
        // Queries the database using the user id
        User.findOne({'id': req.session.user_id}, function (err, user) {
            // Search the user's graphs
            for (var i = 0; i < user.graphs.length; i++) {
                // If the graph is found in their list, the graph is saved in the variable
                if (user.graphs[i].graph_id == page_id) {
                    graph = user.graphs[i];
                }
            }

            /*
                Renders the graph using the graph data. Avoids calling the Facebook API, using
                 the JavaScript objects already saved in MongoDB
              */
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

    // Render graph from query
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

        /*
            Calls the Facebook API using the queried root page id on the fields id, name, likes, large picture,
            category, website, and is_published
          */
        graph.get(root_page_id + "?fields=id,name,likes,picture.type(large),category,website,is_published", function (err, reply) {
            if (err) {
                // Gets the URL that the page was referred from
                var backURL = req.header('Referer') || '/';

                // If the URL contains the error message
                if (backURL.indexOf("error") != -1) {
                    res.redirect(backURL);
                }
                else if (backURL.indexOf("?") != -1) {
                    // If the URL contains a query already
                    res.redirect(backURL + '&error=' + encodeURIComponent("Facebook page not found"));
                }
                else {
                    // If the URL has no errors and no queries
                    res.redirect(backURL + '?error=' + encodeURIComponent("Facebook page not found"));
                }
            }

            // Graph id for database set us root page id
            jsonData.graph_id = reply.id;

            // Saves the root page's data
            jsonData.root = {
                "name": reply.name,
                "id": reply.id,
                "picture": reply.picture.data.url,
                "category": reply.category,
                "website": reply.website
            }

            // If the root page has likes
            if (reply.hasOwnProperty('likes')) {
                // Root page pusehd to pages array used to develop the nodes and edges later
                pages.push(reply.id);

                // For loop that calls the Facebook API for each like of the root page
                async.forEachOf(reply.likes.data, function (page, key, callback) {
                    // Calls the Facebook API using the current liked page id on the fields id, category, and fan_count
                    graph.get(page.id + "?fields=id,category,fan_count", function (err, response) {
                        // If the category filter is selected
                        if (category) {
                            /*
                                Adds page ids to pages array if the the liked pages category equals the root pages category
                                and if the liked pages fan_count is greater than the queried likes value
                             */
                            if (reply.category == response.category && response.fan_count > likes) {
                                pages.push(response.id);
                            }
                        }
                        else if (response.fan_count > likes) {
                            /*
                                If the category filter is not selected, the liked pages is added to the pages array if
                                it's fan_count is greater than the queried likes valued
                            */
                            pages.push(response.id);
                        }

                        callback();
                    });
                }, function (err) {
                    if (err) {
                        console.error(err);
                        res.redirect('/');

                    }

                    // Sets depth of graph
                    setDepth(jsonData, pages, reply.category, category, depth, likes, req, res)
                });
            }
            else if (reply.is_published = "1") {
                // If the root page does not have likes but is published
                jsonData.nodes.push({
                    "id": reply.id,
                    "name": reply.name,
                    "picture": reply.picture.data.url
                });

                // Saves data to session
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

    // Render graph from params
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

// Sets the depth of the graph to 1 or 2
function setDepth(jsonData, pages, root_category, query_category, depth, likes, req, res) {
    jsonData.category = query_category;
    jsonData.likes = likes;

    // The user chooses depth 2
    if (depth == "2") {
        // d2 is added to the graph id in order to differentiate between graphs in the database
        jsonData.graph_id += "d2";
        // Depth of 2 is added to the graph's data
        jsonData.depth = "2";

        // Loops through each page in the pages array
        async.forEachOf(pages, function (page, key, callback) {
            // Calls the Facebook API for each page
            graph.get(page + "?fields=id,likes", function (err, response) {
                // If the current page has likes
                if (response.hasOwnProperty('likes')) {
                    // Loops through each of the likes from the current page
                    async.forEachOf(response.likes.data, function (page2, key, cb) {
                        // Calls the Facebook API for each of the page's likes
                        graph.get(page2.id + "?fields=id,category,fan_count", function (err, response) {
                            // If the user is filtering by category
                            if (query_category) {
                                /*
                                    If the root pages category equals the current pages category, and the
                                    current pages fan_count is greater than the queried likes amount
                                */
                                if (root_category == response.category && response.fan_count > likes) {
                                    if (pages.indexOf(response.id) == -1)
                                        pages.push(response.id);
                                }
                            }
                            else if (response.fan_count > likes){
                                /*
                                    If the category filter is not selected, the liked page is added to the pages array if
                                    it's fan_count is greater than the queried likes valued
                                 */
                                if (pages.indexOf(response.id) == -1)
                                    pages.push(response.id);
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
                    callback();
                }
            });
        }, function (err) {
            if (err) {
                console.error(err);
                res.redirect('/');
            }

            // Gets nodes and edges
            getNodesAndEdges(jsonData, pages, req, res);
        });
    }
    else {
        // If the graph is depth 1
        jsonData.graph_id += "d1";
        jsonData.depth = "1";

        // Gets nodes and edges
        getNodesAndEdges(jsonData, pages, req, res);
    }

    // If the user is filtering the graph by category, "c" is added to the id
    if (query_category) {
        jsonData.graph_id += "c";
    }

    // The amount of likes filtered by is added to the end of the id
    jsonData.graph_id += likes;
}

// Pushs the nodes and edges to the JavaScript object used to render the graph
function getNodesAndEdges(jsonData, pages, req, res) {
    // Loops through each page in the pages array
    async.forEachOf(pages, function (page, key, callback) {
        // Calls the Facebook API for each page
        graph.get(page + "?fields=id,name,likes,picture.type(large),category,fan_count", function (err, reply) {
            // Pushes each page's data to the nodes
            jsonData.nodes.push({
                "id": reply.id,
                "name": reply.name,
                "picture": reply.picture.data.url,
                "category": reply.category,
                "fan_count": reply.fan_count
            });

            // If the current reply has likes
            if (reply.hasOwnProperty('likes')) {
                // Loops through each of the likes from the current page
                for (var x in reply.likes.data) {
                    // If the current like from the current page is in the pages array, a link is made
                    if (pages.indexOf(reply.likes.data[x].id) > -1) {
                        jsonData.links.push({
                            "source": page,
                            "target": reply.likes.data[x].id
                        });
                    }
                }
            }
            else {
                // If the current pages has no likes, it is added as a link itself
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

        // Data is saved in session
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