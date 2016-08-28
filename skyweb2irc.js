var Skyweb = require('skyweb');
var irc = require('irc');
var striptags = require('striptags');
var Entities = require('html-entities').XmlEntities;
var entities = new Entities();

var config = require('./config')

/**********************************************
 * Connect to Skype
 **********************************************/

var skyweb = new Skyweb();

var skype_account;

function main() {
    skyweb.login(config.skype_login, config.skype_password).then(function (skypeAccount) {
        console.log('Skyweb is initialized now');
        skype_account = skypeAccount;
        on_skype_initialized();
    });

    function on_skype_initialized() {
        if (config.skype_conversation_id == 'unknown') {
            // Only partially configured. Help the user get the Conversation ID.
            console.log('Conversation ID unknown, trying to find it. Please send a message on the Skype chat.')
            skyweb.messagesCallback = (function (messages) {
                var conversation_link = messages[0].resource.conversationLink;
                var conversation_id = conversation_link.substring(conversation_link.lastIndexOf('/') + 1);
                console.log('Conversation ID: ' + conversation_id);
                process.exit();
            });
        }
        else {
            // Fully configured, let's connect to IRC and start relaying.
            connect_to_irc();
            setup_irc_to_skype();
            setup_skype_to_irc();
        }
    }
}
main();

/**********************************************
 * Connect to IRC
 **********************************************/

var irc_client;

function connect_to_irc() {
    irc_client = new irc.Client(config.irc_hostname, config.irc_nick, {
        channels: [config.irc_channel],
        port: config.irc_port,
        secure: config.irc_tls,
    });

    irc_client.addListener('error', function(message) {
        console.log('irc error: ', message);
    });
}

/**********************************************
 * IRC to Skype
 **********************************************/

var url_regexp = /(\b(https?|ftp):\/\/[^  ]+)/
function encode_skype(text) {
    text = entities.encode(text); // Escape HTML entities
    text = text.replace(url_regexp, '<a href="$1">$1</a>'); // Make links clickable for Skype users.
    return text;
}

// A /me from IRC (aka CTCP ACTION)
var action_regexp = /^ACTION (.*)$/

function setup_irc_to_skype() {
    function send_to_skype(message) {
        console.log('IRC -> Skype: ' + message);
        skyweb.sendMessage(config.skype_conversation_id, message);
    }

    // Callback for when an IRC non-CTCP message is received
    irc_client.addListener('message' + config.irc_channel, function (from, message) {
        send_to_skype('&lt;' + from + '&gt; ' + encode_skype(message));
    });

    // Callback for when a CTCP message is received, eg. ACTION (aka. /me)
    irc_client.addListener('ctcp-privmsg', function (from, to, text, message) {
        var res = text.match(action_regexp);
        if (to != config.irc_channel || !res) {
            return;
        }
        send_to_skype('* ' + from + ' ' + encode_skype(res[1]));
    });

    // Callback for when a user joins the channel.
    irc_client.addListener('join' + config.irc_channel, function (nick, message) {
        send_to_skype('--&gt; ' + nick + ' joined.');
    });

    // Callback for when a user leaves a channel.
    irc_client.addListener('part' + config.irc_channel, function (nick, reason, message) {
        if (typeof reason == 'undefined') {
            send_to_skype('&lt;-- ' + nick + ' left the channel.');
        }
        else {
            send_to_skype('&lt;-- ' + nick + ' left the channel: ' + encode_skype(reason));
        }
    });

    // Callback for when a user leaves the network.
    irc_client.addListener('quit', function (nick, reason, channels, message) {
        send_to_skype('&lt;-- ' + nick + ' left the network: ' + encode_skype(reason));
    });

    // Callback for when the topic is changed, or when the bot joins the channel
    irc_client.addListener('topic', function (channel, topic, nick, message) {
        if (message.rawCommand != 'TOPIC') { // Probably 333
            // Don't relay the topic when joining the channel.
            return;
        }
        send_to_skype('--- ' + nick + ' changed the topic to: ' + encode_skype(topic));
    });
}


/**********************************************
 * Skype to IRC
 **********************************************/

// Magic thing in the content of a topic/picture update
var initiator_regexp = /<initiator>8:([^<]+)<\/initiator>/

// Magic thing to get the URL of the group picture
var url_value_regexp = /<value>URL@([^<]+)<\/value>/
var uri_object_regexp = /type="([^"]+)" uri="([^"]+)"/

// IRC colors
var nick_colors = [
    "\x0305", "\x0304", "\x0303", "\x0309", "\x0302",
    "\x0312", "\x0306",   "\x0313", "\x0310", "\x0311"]

// Deterministically colorize a Skype a Skype nick on IRC, like most IRC clients do.
function nick_to_color(nick){
    var hash = 0;
    var i = nick.length;
    while (i--) {
        char = nick.charCodeAt(i);
        hash += char;
    }
    return nick_colors[hash % nick_colors.length];
}

// Decode a message from Skype. Basically, remove HTML tags and decode HTML entities.
function decode_skype(text) {
    return entities.decode(striptags(text));
}

function setup_skype_to_irc() {
    function send_to_irc(message) {
        console.log('Skype -> IRC: ' + message);
        irc_client.say(config.irc_channel, message);
    }

    // Called when something happens on the Skype side.
    skyweb.messagesCallback = (function (messages) {
        messages.forEach(function (message) {
            var resource = message.resource;
            var author = resource.from.split('/8:', 2)[1]; // XXX: What does that even mean?
            if (resource.messagetype == 'Control/Typing') {
                // Someone is writing something. Ignore.
                return;
            }
            else if (resource.messagetype == 'RichText') {
                // Real message
                console.log(message);
                if (author == config.skype_login) {
                    // Sent by the bot itself, ignore.
                    return;
                }

                var edited = ''
                if (typeof (resource.skypeeditedid) != 'undefined') {
                    // This message is an edit of a previous message by the same author.
                    edited = ' (edited)';
                }
                send_to_irc('<' + nick_to_color(author) + author + '\x0f' + edited + '> ' + decode_skype(resource.content));
            }
            else if (resource.messagetype == 'RichText/UriObject') {
                var data = resource.content.match(uri_object_regexp);
                var type = data[1];
                var uri = data[2];
                if (type == 'Picture.1') {
                    send_to_irc('--- ' + nick_to_color(author) + author + '\x0f sent an image: ' + uri + '/views/imgpsh_fullsize');
                }
                else {
                    send_to_irc('--- ' + nick_to_color(author) + author + '\x0f sent an unknown URI object (' + type + '): ' + uri);
                }
            }
            else if (resource.messagetype == 'ThreadActivity/TopicUpdate') {
                // Update of the name of the group.
                author = resource.content.match(initiator_regexp)[1];
                send_to_irc('--- ' + nick_to_color(author) + author + '\x0f changed the topic to: ' + decode_skype(resource.threadtopic));
            }
            else if (resource.messagetype == 'ThreadActivity/PictureUpdate') {
                // Update of the picture of the group.
                author = resource.content.match(initiator_regexp)[1];
                url = resource.content.match(url_value_regexp)[1];
                send_to_irc('--- ' + nick_to_color(author) + author + '\x0f changed the image to: ' + url);
            }
            else {
                send_to_irc('*** Unknown message type: ' + resource.messagetype + ' ***');
                console.log(message);
            }
        });
    });
}

