var mongoose = require('mongoose');

// User schema
var UserSchema = new mongoose.Schema({
    id: String,
    name: String,
    graphs: []
});

var User = mongoose.model('User', UserSchema);

module.exports = User;