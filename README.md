# Skyweb 2 IRC

## Install and configure

1. Dependencies: `npm install skyweb irc html-entities striptags`
2. `mv config.js.template config.js`
3. Edit `config.js` to configure it. If you don't know the conversation ID, leave it `unknown`. Otherwise, skip step 4.
4. Run `nodejs skyweb2irc.js` and send a message in the chat using your Skype client. Copy-paste the value printed by skyweb2irc as the value of `skype_conversation_id`.
5. Run `nodejs skyweb2irc.js`

## What is this?

It is a small bot relaying messages between an IRC channel and a Skype group chat.

I wrote it because Skype suddenly decided to break its API, so my [skype2irc](https://github.com/boamaod/skype2irc) bot did not work anymore.

## Features

### Skype -> IRC

* text messages, with edits and decoding of format tags
* image upload (files are not supported, see [#6](https://github.com/ProgVal/skyweb2irc/issues/6))
* topic and picture update
* member addition and removal
* deterministic nick coloration

### IRC -> Skype

* text messages, with URLs, decoding of format characters, and stripping color codes
* CTCP ACTION (ie. `/me`)
* channel joins
* channel parts
* quits
* topic updates

## Why did you write it using node.js?

I found a library for Skype written for node.js, [Skyweb](https://github.com/ShyykoSerhiy/skyweb).
