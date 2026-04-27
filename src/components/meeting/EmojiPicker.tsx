'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Clock } from 'lucide-react'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😊',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍',
      '🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢',
      '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌',
      '😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠',
      '🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹',
      '😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱',
      '😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    name: 'Gestures',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛',
      '🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪',
    ],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓',
      '💗','💖','💘','💝','💟',
    ],
  },
  {
    name: 'Animals',
    icon: '🐱',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
      '🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛',
      '🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎',
      '🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊',
      '🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫',
    ],
  },
  {
    name: 'Food',
    icon: '🍕',
    emojis: [
      '🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥨',
      '🥯','🥖','🫓','🧀','🥗','🥙','🫔','🌮','🌯','🥪','♨️','🍲','🫕','🥣','🥘',
      '🫘','🍛','🍜','🍝','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮',
      '🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪',
      '🌰','🥜','🍯',
    ],
  },
  {
    name: 'Objects',
    icon: '💡',
    emojis: [
      '💡','🔦','🕯️','📱','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💾','💿','📀','📷','📸',
      '📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️',
      '⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🛢️','💸','💵','💴','💶','💷','🪙',
      '💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️',
      '🪤','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺',
      '🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬',
      '🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥',
      '🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌',
    ],
  },
  {
    name: 'Symbols',
    icon: '🔴',
    emojis: [
      '✅','❌','❓','❗','⚠️','⭐','🌟','💫','✨','🔥','💥','💢','💦','💨','🌀',
      '🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️',
      '💨','🌊','💧','💦','🫧','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️',
      '🎪','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎹','🪗','🥁','🪘','🎷','🎺','🪗','🎸',
      '🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️','🧩','🪄','🔮','🪅','🧿',
    ],
  },
]

// A flat lookup map for search: we give each emoji a descriptive label
// We map groups of emojis to search keywords so users can type "heart" or "fire"
const EMOJI_SEARCH_MAP: Record<string, string[]> = {
  // Smileys
  '😀': ['grin', 'happy', 'smile'], '😃': ['smile', 'happy'], '😄': ['smile', 'happy', 'laugh'],
  '😁': ['grin', 'happy', 'smile'], '😆': ['laugh', 'happy'], '😅': ['sweat', 'laugh', 'nervous'],
  '🤣': ['rofl', 'laugh', 'rolling'], '😂': ['joy', 'tears', 'laugh', 'crying'],
  '🙂': ['slight', 'smile'], '🙃': ['upside', 'down', 'sarcasm'], '😉': ['wink'],
  '😊': ['blush', 'smile', 'happy'], '😇': ['innocent', 'angel', 'halo'],
  '🥰': ['love', 'hearts', 'adore'], '😍': ['heart', 'eyes', 'love'],
  '🤩': ['star', 'eyes', 'excited', 'wow'], '😘': ['kiss', 'love', 'heart'],
  '😗': ['kiss', 'peck'], '😚': ['kiss', 'blush'], '😙': ['kiss', 'smile'],
  '🥲': ['smile', 'tear', 'sad'], '😋': ['yummy', 'tongue', 'delicious'],
  '😛': ['tongue', 'playful'], '😜': ['wink', 'tongue', 'silly'], '🤪': ['zany', 'crazy', 'goofy'],
  '😝': ['squint', 'tongue', 'silly'], '🤑': ['money', 'rich', 'dollar'],
  '🤗': ['hug', 'embrace', 'warm'], '🤭': ['giggle', 'cover', 'mouth', 'shy'],
  '🫢': ['gasp', 'facepalm', 'oops'], '🤫': ['shh', 'quiet', 'secret', 'silence'],
  '🤔': ['think', 'thinking', 'hmm', 'wonder'], '🫡': ['salute', 'military', 'yes'],
  '🤐': ['zipper', 'mouth', 'quiet', 'shut'], '🤨': ['raised', 'eyebrow', 'skeptical', 'suspicious'],
  '😐': ['neutral', 'meh', 'blank'], '😑': ['expressionless', 'blank', 'meh'],
  '😶': ['no', 'mouth', 'silent', 'speechless'], '🫥': ['dotted', 'fade', 'invisible'],
  '😏': ['smirk', 'smug', 'sassy'], '😒': ['unamused', 'bored', 'annoyed'],
  '🙄': ['eye', 'roll', 'annoyed', 'whatever'], '😬': ['grimace', 'awkward', 'cringe', 'nervous'],
  '🤥': ['pinocchio', 'liar', 'lie'], '😌': ['relieved', 'peaceful', 'calm'],
  '😔': ['pensive', 'sad', 'thoughtful', 'down'], '😪': ['sleepy', 'tired'],
  '🤤': ['drool', 'hungry', 'excited'], '😴': ['sleeping', 'zzz', 'sleep'],
  '😷': ['mask', 'sick', 'covid', 'ill'], '🤒': ['thermometer', 'sick', 'fever', 'ill'],
  '🤕': ['bandage', 'hurt', 'injured'], '🤢': ['nauseated', 'sick', 'gross', 'ew'],
  '🤮': ['vomit', 'sick', 'puke'], '🥵': ['hot', 'heat', 'sweating'],
  '🥶': ['cold', 'freezing', 'chill', 'ice'], '🥴': ['drunk', 'dizzy', 'woozy'],
  '😵': ['dizzy', 'dead', 'knocked', 'out'], '🤯': ['exploding', 'head', 'mind', 'blown'],
  '🤠': ['cowboy', 'hat', 'yeehaw'], '🥳': ['party', 'celebrate', 'birthday'],
  '🥸': ['disguise', 'incognito', 'nose', 'glasses'], '😎': ['cool', 'sunglasses', 'awesome'],
  '🤓': ['nerd', 'glasses', 'geek', 'smart'], '🧐': ['monocle', 'inspect', 'investigate'],
  '😕': ['confused', 'unsure', 'uncertain'], '🫤': ['diagonal', 'mouth', 'uncertain'],
  '😟': ['worried', 'concerned'], '🙁': ['frown', 'sad', 'unhappy'],
  '😮': ['oh', 'surprised', 'open', 'mouth'], '😯': ['hushed', 'surprised', 'quiet'],
  '😲': ['astonished', 'shocked', 'surprised'], '😳': ['flushed', 'embarrassed', 'shy', 'red'],
  '🥺': ['pleading', 'puppy', 'eyes', 'please'], '🥹': ['holding', 'tears', 'proud', 'moved'],
  '😦': ['frowning', 'open', 'mouth', 'sad'], '😧': ['anguished', 'stressed', 'sad'],
  '😨': ['fearful', 'scared', 'afraid', 'nervous'], '😰': ['anxious', 'worried', 'sweat', 'nervous'],
  '😥': ['sad', 'relieved', 'disappointed'], '😢': ['crying', 'tear', 'sad'],
  '😭': ['sobbing', 'crying', 'loud', 'sad'], '😱': ['screaming', 'fear', 'horrified', 'scared'],
  '😖': ['confounded', 'frustrated', 'angry'], '😣': ['persevere', 'struggling', 'frustrated'],
  '😞': ['disappointed', 'sad', 'down'], '😓': ['downcast', 'sweat', 'sad', 'nervous'],
  '😩': ['weary', 'tired', 'exhausted'], '😫': ['tired', 'exhausted', 'overwhelmed'],
  '🥱': ['yawning', 'bored', 'tired', 'sleepy'], '😤': ['huff', 'angry', 'steam', 'annoyed'],
  '😡': ['angry', 'mad', 'furious', 'rage'], '😠': ['angry', 'mad', 'frowning'],
  '🤬': ['swearing', 'curse', 'angry', 'profanity'], '😈': ['devil', 'evil', 'imp', 'trouble'],
  '👿': ['angry', 'devil', 'hell', 'evil'], '💀': ['skull', 'dead', 'death'],
  '☠️': ['skull', 'crossbones', 'danger', 'poison', 'death'], '💩': ['poop', 'shit', 'crap'],
  '🤡': ['clown', 'funny', 'silly'], '👹': ['ogre', 'monster', 'scary'],
  '👺': ['goblin', 'monster', 'red', 'nose'], '👻': ['ghost', 'boo', 'halloween', 'spooky'],
  '👽': ['alien', 'ufo', 'space', 'extraterrestrial'], '👾': ['space', 'invader', 'game', 'retro'],
  '🤖': ['robot', 'bot', 'machine', 'ai'],
  // Gestures
  '👋': ['wave', 'hello', 'goodbye', 'bye', 'hi'], '🤚': ['raised', 'back', 'hand', 'stop'],
  '🖐️': ['hand', 'splayed', 'five', 'stop'], '✋': ['hand', 'stop', 'high', 'five', 'halt'],
  '🖖': ['vulcan', 'spock', 'star', 'trek', 'live', 'long', 'prosper'],
  '🫱': ['rightwards', 'hand', 'handshake'], '🫲': ['leftwards', 'hand', 'handshake'],
  '🫳': ['palm', 'down', 'hand'], '🫴': ['palm', 'up', 'hand'],
  '👌': ['ok', 'perfect', 'nice'], '🤌': ['pinched', 'fingers', 'italian', 'chef', 'kiss'],
  '🤏': ['pinching', 'small', 'tiny', 'little'], '✌️': ['peace', 'victory', 'two', 'v'],
  '🤞': ['crossed', 'fingers', 'luck', 'hope'], '🫰': ['hand', 'with', 'index', 'finger', 'thumb', 'crossed'],
  '🤟': ['love', 'you', 'rock', 'sign'], '🤘': ['rock', 'metal', 'horns', 'sign'],
  '🤙': ['call', 'shaka', 'hang', 'loose'], '👈': ['point', 'left', 'back'],
  '👉': ['point', 'right', 'forward'], '👆': ['point', 'up'], '🖕': ['middle', 'finger', 'fuck'],
  '👇': ['point', 'down'], '☝️': ['point', 'up', 'one', 'index'],
  '🫵': ['point', 'at', 'viewer', 'you'], '👍': ['thumbs', 'up', 'like', 'good', 'yes', 'approve'],
  '👎': ['thumbs', 'down', 'dislike', 'no', 'bad'], '✊': ['fist', 'power', 'punch', 'fight'],
  '👊': ['fist', 'bump', 'punch', 'fight'], '🤛': ['left', 'fist', 'bump'],
  '🤜': ['right', 'fist', 'bump'], '👏': ['clap', 'applause', 'bravo', 'praise'],
  '🙌': ['hands', 'up', 'celebrate', 'yay', 'hooray'], '🫶': ['heart', 'hands', 'love'],
  '👐': ['open', 'hands', 'spread'], '🤲': ['palms', 'up', 'together', 'pray', 'give'],
  '🤝': ['handshake', 'deal', 'agreement', 'shake'], '🙏': ['pray', 'please', 'thanks', 'namaste', 'hands'],
  '💪': ['muscle', 'strong', 'flex', 'power', 'gym'],
  // Hearts
  '❤️': ['red', 'heart', 'love'], '🧡': ['orange', 'heart'], '💛': ['yellow', 'heart'],
  '💚': ['green', 'heart'], '💙': ['blue', 'heart'], '💜': ['purple', 'heart'],
  '🖤': ['black', 'heart'], '🤍': ['white', 'heart'], '🤎': ['brown', 'heart'],
  '💔': ['broken', 'heart', 'sad'], '❤️‍🔥': ['heart', 'fire', 'passion', 'burning'],
  '❤️‍🩹': ['heart', 'bandage', 'healing', 'mending'], '💕': ['two', 'hearts', 'love'],
  '💞': ['revolving', 'hearts', 'love'], '💓': ['beating', 'heart', 'pulse'],
  '💗': ['growing', 'heart', 'love'], '💖': ['sparkling', 'heart', 'love'],
  '💘': ['cupid', 'heart', 'arrow', 'love'], '💝': ['gift', 'heart', 'ribbon', 'love'],
  '💟': ['heart', 'decoration', 'ribbon', 'love'],
  // Animals
  '🐶': ['dog', 'puppy', 'pet'], '🐱': ['cat', 'kitten', 'pet'], '🐭': ['mouse', 'rat'],
  '🐹': ['hamster', 'pet'], '🐰': ['rabbit', 'bunny'], '🦊': ['fox'],
  '🐻': ['bear'], '🐼': ['panda'], '🐨': ['koala'],
  '🐯': ['tiger'], '🦁': ['lion'], '🐮': ['cow', 'bull', 'moo'],
  '🐷': ['pig'], '🐸': ['frog', 'toad'], '🐵': ['monkey', 'ape'],
  '🐔': ['chicken'], '🐧': ['penguin'], '🐦': ['bird'],
  '🐤': ['chick', 'baby', 'bird'], '🦆': ['duck'], '🦅': ['eagle'],
  '🦉': ['owl'], '🦇': ['bat'], '🐺': ['wolf'],
  '🐗': ['boar', 'pig'], '🐴': ['horse'], '🦄': ['unicorn'],
  '🐝': ['bee', 'honey', 'buzz'], '🪱': ['worm'], '🐛': ['bug', 'insect'],
  '🦋': ['butterfly'], '🐌': ['snail'], '🐞': ['ladybug'],
  '🐜': ['ant'], '🪰': ['fly'], '🪲': ['beetle'],
  '🪳': ['cockroach', 'roach'], '🦟': ['mosquito'], '🦗': ['cricket'],
  '🕷️': ['spider'], '🦂': ['scorpion'], '🐢': ['turtle', 'tortoise'],
  '🐍': ['snake'], '🦎': ['lizard'], '🦖': ['t-rex', 'dinosaur'],
  '🦕': ['dinosaur', 'brontosaurus'], '🐙': ['octopus'], '🦑': ['squid'],
  '🦐': ['shrimp'], '🦞': ['lobster'], '🦀': ['crab'],
  '🐡': ['blowfish', 'puffer'], '🐠': ['fish', 'tropical'], '🐟': ['fish'],
  '🐬': ['dolphin'], '🐳': ['whale'], '🐋': ['whale', 'humpback'],
  '🦈': ['shark'], '🐊': ['crocodile', 'alligator'], '🐅': ['tiger'],
  '🐆': ['leopard', 'panther'], '🦓': ['zebra'], '🦍': ['gorilla'],
  '🦧': ['orangutan'], '🐘': ['elephant'], '🦛': ['hippo', 'hippopotamus'],
  '🦏': ['rhino', 'rhinoceros'], '🐪': ['camel'], '🐫': ['camel', 'bactrian'],
  // Food
  '🍕': ['pizza'], '🍔': ['burger', 'hamburger'], '🍟': ['fries', 'french'],
  '🌭': ['hotdog', 'hot', 'dog'], '🍿': ['popcorn'], '🧂': ['salt'],
  '🥓': ['bacon'], '🥚': ['egg'], '🍳': ['cooking', 'fried', 'egg', 'pan'],
  '🧇': ['waffle'], '🥞': ['pancake', 'stack'], '🧈': ['butter'],
  '🍞': ['bread'], '🥐': ['croissant'], '🥨': ['pretzel'],
  '🥯': ['bagel'], '🥖': ['baguette'], '🫓': ['flatbread'],
  '🧀': ['cheese'], '🥗': ['salad'], '🥙': ['pita', 'stuffed'],
  '🫔': ['tamale'], '🌮': ['taco'], '🌯': ['burrito'],
  '🥪': ['sandwich'], '♨️': ['hot', 'springs'], '🍲': ['soup', 'stew', 'pot'],
  '🫕': ['fondue'], '🥣': ['bowl', 'cereal'], '🥘': ['stew', 'paella'],
  '🫘': ['beans'], '🍛': ['curry'], '🍜': ['noodle', 'ramen'],
  '🍝': ['spaghetti', 'pasta'], '🍣': ['sushi'], '🍱': ['bento'],
  '🥟': ['dumpling'], '🦪': ['oyster'], '🍤': ['fried', 'shrimp', 'tempura'],
  '🍙': ['rice', 'ball', 'onigiri'], '🍚': ['rice', 'bowl'], '🍘': ['cracker', 'rice'],
  '🍥': ['fish', 'cake'], '🥠': ['fortune', 'cookie'], '🥮': ['moon', 'cake'],
  '🍢': ['food', 'stick', 'skewer'], '🍡': ['dango', 'stick'], '🍧': ['shaved', 'ice'],
  '🍨': ['ice', 'cream'], '🍦': ['ice', 'cream', 'cone'], '🥧': ['pie'],
  '🧁': ['cupcake'], '🍰': ['cake', 'slice'], '🎂': ['birthday', 'cake'],
  '🍮': ['pudding'], '🍭': ['lollipop'], '🍬': ['candy'],
  '🍫': ['chocolate'], '🍩': ['donut', 'doughnut'], '🍪': ['cookie'],
  '🌰': ['chestnut'], '🥜': ['peanut'], '🍯': ['honey'],
  // Objects
  '💡': ['bulb', 'light', 'idea'], '🔦': ['flashlight', 'torch'],
  '🕯️': ['candle'], '📱': ['phone', 'mobile', 'cell'],
  '💻': ['laptop', 'computer'], '🖥️': ['desktop', 'computer', 'screen'],
  '🖨️': ['printer'], '⌨️': ['keyboard'], '🖱️': ['mouse', 'computer'],
  '🖲️': ['trackball'], '💾': ['floppy', 'disk', 'save'],
  '💿': ['cd', 'disc'], '📀': ['dvd', 'disc'],
  '📷': ['camera'], '📸': ['camera', 'flash'],
  '📹': ['video', 'camera'], '🎥': ['movie', 'film', 'camera'],
  '📽️': ['projector'], '🎞️': ['film', 'frames'],
  '📞': ['phone', 'receiver'], '☎️': ['phone', 'telephone'],
  '📟': ['pager'], '📠': ['fax'],
  '📺': ['tv', 'television'], '📻': ['radio'],
  '🎙️': ['microphone', 'studio'], '🎚️': ['level', 'slider', 'control'],
  '🎛️': ['control', 'knobs'], '🧭': ['compass'],
  '⏱️': ['stopwatch'], '⏲️': ['timer'],
  '⏰': ['alarm', 'clock'], '🕰️': ['clock', 'mantel'],
  '⌛': ['hourglass', 'time'], '⏳': ['hourglass', 'time', 'sand'],
  '📡': ['satellite', 'antenna'], '🔋': ['battery'],
  '🪫': ['battery', 'low'], '🛢️': ['oil', 'barrel'],
  '💸': ['money', 'wings', 'flying'], '💵': ['dollar', 'money', 'bill'],
  '💴': ['yen', 'money'], '💶': ['euro', 'money'], '💷': ['pound', 'money'],
  '🪙': ['coin'], '💰': ['money', 'bag'], '💳': ['credit', 'card'],
  '💎': ['gem', 'diamond', 'jewel'], '⚖️': ['scale', 'balance', 'justice'],
  '🪜': ['ladder'], '🧰': ['toolbox'], '🪛': ['screwdriver'],
  '🔧': ['wrench', 'tool'], '🔨': ['hammer'], '⚒️': ['hammer', 'pick'],
  '🛠️': ['tools', 'hammer', 'wrench'], '⛏️': ['pick', 'mining'],
  '🪚': ['saw'], '🔩': ['bolt', 'nut'], '⚙️': ['gear', 'settings', 'cog'],
  '🪤': ['trap', 'mouse'], '🧲': ['magnet'],
  '🔫': ['gun', 'pistol', 'water'], '💣': ['bomb', 'explosion'],
  '🧨': ['firecracker', 'dynamite'], '🪓': ['axe'],
  '🔪': ['knife', 'cut'], '🗡️': ['sword', 'dagger'],
  '⚔️': ['swords', 'crossed'], '🛡️': ['shield', 'protection'],
  '🚬': ['cigarette', 'smoking'], '⚰️': ['coffin'],
  '🪦': ['gravestone', 'tombstone'], '⚱️': ['urn'],
  '🏺': ['amphora', 'pot'], '🔮': ['crystal', 'ball', 'magic', 'fortune'],
  '📿': ['prayer', 'beads'], '🧿': ['nazar', 'evil', 'eye'],
  '🪬': ['hamsa', 'hand'], '💈': ['barber', 'pole'],
  '⚗️': ['alembic', 'distill'], '🔭': ['telescope'],
  '🔬': ['microscope'], '🕳️': ['hole'],
  '🩹': ['bandage', 'adhesive'], '🩺': ['stethoscope', 'doctor'],
  '💊': ['pill', 'medicine', 'drug'], '💉': ['syringe', 'needle', 'shot', 'vaccine'],
  '🩸': ['blood', 'drop'], '🧬': ['dna', 'helix', 'genetics'],
  '🦠': ['microbe', 'virus', 'bacteria'], '🧫': ['petri', 'dish'],
  '🧪': ['test', 'tube', 'experiment'], '🌡️': ['thermometer', 'temperature'],
  '🧹': ['broom'], '🪠': ['plunger'], '🧺': ['basket'],
  '🧻': ['toilet', 'paper', 'roll'], '🚽': ['toilet'],
  '🚰': ['water', 'tap', 'faucet'], '🚿': ['shower'], '🛁': ['bathtub'],
  '🛀': ['bath', 'person'], '🧼': ['soap'], '🪥': ['toothbrush'],
  '🪒': ['razor'], '🧽': ['sponge'], '🪣': ['bucket'],
  '🧴': ['lotion', 'bottle'], '🛎️': ['bell', 'hotel', 'service'],
  '🔑': ['key'], '🗝️': ['key', 'old'], '🚪': ['door'],
  '🪑': ['chair'], '🛋️': ['couch', 'sofa'], '🛏️': ['bed'],
  '🛌': ['sleep', 'bed', 'person'],
  // Symbols
  '✅': ['check', 'done', 'correct', 'yes'], '❌': ['cross', 'wrong', 'no', 'x', 'cancel'],
  '❓': ['question', 'help'], '❗': ['exclamation', 'alert', 'important'],
  '⚠️': ['warning', 'caution', 'alert'], '⭐': ['star', 'favorite', 'rate'],
  '🌟': ['glowing', 'star'], '💫': ['dizzy', 'star', 'shooting'],
  '✨': ['sparkle', 'shiny', 'new', 'magic'], '🔥': ['fire', 'hot', 'lit', 'trending'],
  '💥': ['boom', 'explosion', 'collision'], '💢': ['anger', 'vein'],
  '💦': ['splash', 'water', 'sweat'], '💨': ['dash', 'fast', 'wind'],
  '🌀': ['cyclone', 'swirl', 'tornado'], '🌈': ['rainbow'],
  '☀️': ['sun', 'sunny', 'bright'], '🌤️': ['sun', 'cloud', 'partly'],
  '⛅': ['cloud', 'sun', 'partly'], '🌥️': ['cloud', 'mostly'],
  '☁️': ['cloud', 'cloudy'], '🌦️': ['rain', 'sun'],
  '🌧️': ['rain', 'rainy'], '⛈️': ['storm', 'thunder', 'lightning'],
  '🌩️': ['lightning', 'cloud', 'storm'], '🌨️': ['snow', 'cloud'],
  '❄️': ['snow', 'cold', 'winter', 'ice'], '☃️': ['snowman'],
  '⛄': ['snowman', 'frosty'], '🌬️': ['wind', 'blow'],
  '🌊': ['wave', 'ocean', 'water'], '💧': ['water', 'drop', 'drip'],
  '🫧': ['bubble', 'bubbles'], '🏆': ['trophy', 'winner', 'champion', 'first'],
  '🥇': ['gold', 'medal', 'first', 'winner'], '🥈': ['silver', 'medal', 'second'],
  '🥉': ['bronze', 'medal', 'third'], '🏅': ['medal', 'sports'],
  '🎖️': ['military', 'medal'], '🏵️': ['rosette', 'ribbon'],
  '🎗️': ['ribbon', 'awareness'], '🎫': ['ticket', 'admission'],
  '🎟️': ['ticket', 'admission'], '🎪': ['circus', 'tent'],
  '🎭': ['theater', 'drama', 'masks'], '🎨': ['art', 'paint', 'palette'],
  '🎬': ['clapper', 'movie', 'film'], '🎤': ['microphone', 'sing', 'karaoke'],
  '🎧': ['headphones', 'music', 'audio'], '🎵': ['music', 'note'],
  '🎶': ['music', 'notes'], '🎹': ['piano', 'keyboard', 'music'],
  '🪗': ['accordion'], '🥁': ['drum'], '🪘': ['drum', 'long'],
  '🎷': ['saxophone'], '🎺': ['trumpet'], '🎸': ['guitar'],
  '🪕': ['banjo'], '🎻': ['violin'], '🎲': ['dice', 'die', 'game', 'random'],
  '♟️': ['chess', 'pawn'], '🎯': ['target', 'bullseye', 'goal', 'aim'],
  '🎳': ['bowling'], '🎮': ['game', 'controller', 'gaming'],
  '🕹️': ['joystick', 'game'], '🧩': ['puzzle', 'piece', 'jigsaw'],
  '🪄': ['magic', 'wand', 'wizard'], '🪅': ['pinata', 'party'],
  '🧿': ['nazar', 'evil', 'eye'],
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(0)
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Flatten all emojis with their categories for search
  const allEmojis = useMemo(() => {
    const flat: { emoji: string; category: string }[] = []
    for (const cat of EMOJI_CATEGORIES) {
      for (const emoji of cat.emojis) {
        flat.push({ emoji, category: cat.name })
      }
    }
    return flat
  }, [])

  // Filter emojis based on search query
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) {
      return EMOJI_CATEGORIES[activeCategory]?.emojis ?? []
    }

    const query = searchQuery.toLowerCase().trim()

    // Search across all categories
    return allEmojis
      .filter(({ emoji, category }) => {
        // Search by category name
        if (category.toLowerCase().includes(query)) return true
        // Search by keywords in EMOJI_SEARCH_MAP
        const keywords = EMOJI_SEARCH_MAP[emoji]
        if (keywords?.some((kw) => kw.includes(query))) return true
        // The emoji itself
        if (emoji.includes(query)) return true
        return false
      })
      .map(({ emoji }) => emoji)
  }, [searchQuery, activeCategory, allEmojis])

  // Unique filtered emojis (avoid duplicates from category name matches)
  const uniqueFilteredEmojis = useMemo(() => {
    const seen = new Set<string>()
    return filteredEmojis.filter((emoji) => {
      if (seen.has(emoji)) return false
      seen.add(emoji)
      return true
    })
  }, [filteredEmojis])

  const handleSelect = useCallback(
    (emoji: string) => {
      // Update recently used (keep last 10, most recent first, no duplicates)
      setRecentEmojis((prev) => {
        const filtered = prev.filter((e) => e !== emoji)
        return [emoji, ...filtered].slice(0, 10)
      })
      onSelect(emoji)
    },
    [onSelect]
  )

  const handleCategoryChange = useCallback((index: number) => {
    setActiveCategory(index)
    setSearchQuery('')
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="z-50 flex flex-col w-[340px] max-h-[400px] rounded-xl bg-zinc-800 border border-zinc-700 shadow-2xl shadow-black/40 overflow-hidden"
    >
      {/* Search Bar */}
      <div className="relative flex items-center px-3 pt-3 pb-2">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search emojis..."
          className="w-full h-8 pl-8 pr-8 rounded-lg bg-zinc-900/80 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      {!searchQuery && (
        <div className="flex items-center gap-0.5 px-2 pb-2 overflow-x-auto scrollbar-none">
          {EMOJI_CATEGORIES.map((cat, index) => (
            <button
              key={cat.name}
              onClick={() => handleCategoryChange(index)}
              title={cat.name}
              aria-label={cat.name}
              className={`flex items-center justify-center h-8 min-w-[36px] px-2 rounded-lg text-base transition-all cursor-pointer shrink-0 ${
                activeCategory === index
                  ? 'bg-zinc-700/70 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40'
              }`}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Separator */}
      <div className="mx-3 h-px bg-zinc-700/50" />

      {/* Search active indicator */}
      {searchQuery && (
        <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium">
          {uniqueFilteredEmojis.length} result{uniqueFilteredEmojis.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
        </div>
      )}

      {/* Emoji Grid */}
      <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0" style={{ maxHeight: '240px' }}>
        {uniqueFilteredEmojis.length > 0 ? (
          <div className="grid grid-cols-8 gap-0.5">
            <AnimatePresence mode="popLayout">
              {uniqueFilteredEmojis.map((emoji) => (
                <motion.button
                  key={emoji}
                  onClick={() => handleSelect(emoji)}
                  whileHover={{ scale: 1.35 }}
                  whileTap={{ scale: 0.9 }}
                  className="flex items-center justify-center w-9 h-9 rounded-md text-xl hover:bg-zinc-700/60 transition-colors cursor-pointer select-none"
                  title={emoji}
                  aria-label={`Emoji ${emoji}`}
                >
                  {emoji}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <span className="text-2xl opacity-50">🔍</span>
            <p className="text-xs text-zinc-500">No emojis found</p>
          </div>
        )}
      </div>

      {/* Recently Used Section */}
      <AnimatePresence>
        {recentEmojis.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Separator */}
            <div className="mx-3 h-px bg-zinc-700/50" />

            <div className="px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="h-3 w-3 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Recent
                </span>
              </div>
              <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
                {recentEmojis.map((emoji) => (
                  <motion.button
                    key={emoji}
                    onClick={() => handleSelect(emoji)}
                    whileHover={{ scale: 1.3 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex items-center justify-center h-8 min-w-[32px] px-1 rounded-md text-lg hover:bg-zinc-700/60 transition-colors cursor-pointer select-none shrink-0"
                    title={emoji}
                    aria-label={`Recent emoji ${emoji}`}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close Button (subtle footer) */}
      <div className="flex items-center justify-end px-3 py-1.5 border-t border-zinc-700/40">
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
          <span>Close</span>
        </button>
      </div>
    </motion.div>
  )
}
