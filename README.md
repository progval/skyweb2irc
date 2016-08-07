# Skyweb 2 IRC

## Install and configure

1. Dependencies: `npm install skyweb irc html-entities`
2. `mv config.js.template config.js`
3. Edit `config.js` to configure it. If you don't know the conversation ID, leave it `unknown`. Otherwise, skip step 4.
4. Run `nodejs skyweb2irc.js` and send a message in the chat using your Skype client. Copy-paste the value printed by skyweb2irc as the value of `skype_conversation_id`.
5. Run `nodejs skyweb2irc.js`

## What is this?

It is a small bot connecting to an IRC channel and a Skype chat.

I wrote it because Skype suddenly decided to break its API, so my [skype2irc](https://github.com/boamaod/skype2irc) bot did not work anymore.

## Why did you write it using node.js?

I found a library for Skype written for node.js, [Skyweb](https://github.com/ShyykoSerhiy/skyweb).
