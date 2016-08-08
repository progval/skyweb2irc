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
            console.log('Conversation ID unknown, trying to find it. Please send a message on the Skype chat.')
            skyweb.messagesCallback = (function (messages) {
                var conversation_link = messages[0].resource.conversationLink;
                var conversation_id = conversation_link.substring(conversation_link.lastIndexOf('/') + 1);
                console.log('Conversation ID: ' + conversation_id);
                process.exit();
            });
        }
        else {
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
    text = entities.encode(text);
    return text.replace(url_regexp, '<a href="$1">$1</a>');
}

function setup_irc_to_skype() {
    function send_to_skype(message) {
        console.log('IRC -> Skype: ' + message);
        skyweb.sendMessage(config.skype_conversation_id, message);
    }

    irc_client.addListener('message' + config.irc_channel, function (from, message) {
        send_to_skype('&lt;' + from + '&gt; ' + encode_skype(message));
    });
    irc_client.addListener('join' + config.irc_channel, function (nick, message) {
        send_to_skype('--&gt; ' + nick + ' joined.');
    });
    irc_client.addListener('part' + config.irc_channel, function (nick, reason, message) {
        send_to_skype('&lt;-- ' + nick + ' left: ' + encode_skype(reason));
    });
}


/**********************************************
 * Skype to IRC
 **********************************************/

var nick_colors = [
    "\x0305", "\x0304", "\x0303", "\x0309", "\x0302",
    "\x0312", "\x0306",   "\x0313", "\x0310", "\x0311"]

function nick_to_color(nick){
    var hash = 0;
    var i = nick.length;
    while (i--) {
        char = nick.charCodeAt(i);
        hash += char;
    }
    return nick_colors[hash % nick_colors.length];
}

function decode_skype(text) {
    return entities.decode(striptags(text));
}


function setup_skype_to_irc() {
    function send_to_irc(message) {
        console.log('Skype -> IRC: ' + message);
        irc_client.say(config.irc_channel, message);
    }
    skyweb.messagesCallback = (function (messages) {
        messages.forEach(function (message) {
            var resource = message.resource;
            var author = resource.from.split('/8:', 2)[1]; // TODO: Improve this.
            if (resource.messagetype == 'Control/Typing') {
                // Ignore.
            }
            else if (resource.messagetype == 'RichText') {
                if (author != config.skype_login) {
                    send_to_irc('<' + nick_to_color(author) + author + '\x0f> ' + decode_skype(resource.content));
                }
            }
            else {
                send_to_irc('*** Unknown message type: ' + resource.messagetype + ' ***');
                console.log(message);
            }
        });
    });
}

