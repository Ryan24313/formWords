// Imported modules
const express = require('express')
const session = require('express-session')
const sqlite3 = require('sqlite3').verbose()
const crypto = require('crypto');
const socketIo = require('socket.io')
const jwt = require('jsonwebtoken')


// Setup
const db = new sqlite3.Database('databases/database.db')

const config = require('./config.json')

const app = express()
const http = require('http').createServer(app)
const io = new socketIo.Server(http)

app.set('view engine', 'ejs')

const sessionMiddleware = session({
	secret: crypto.randomBytes(256).toString('hex'),
	resave: false,
	saveUninitialized: true
})

app.use(sessionMiddleware)

io.use((socket, next) => {
	sessionMiddleware(socket.request, {}, next)
})

app.use(express.urlencoded({ extended: true }))

app.use(express.static(__dirname + '/static'))


// Constants
const PORT = 3000
const BOARD_SIZE = 10
const STARTING_LETTERS = {
	A: 7,
	B: 3,
	C: 4,
	D: 5,
	E: 8,
	F: 3,
	G: 3,
	H: 3,
	I: 7,
	J: 1,
	K: 2,
	L: 5,
	M: 5,
	N: 5,
	O: 7,
	P: 3,
	QU: 1,
	R: 5,
	S: 6,
	T: 5,
	U: 5,
	V: 1,
	W: 2,
	X: 1,
	Y: 2,
	Z: 1
}
const PAGES = {
	'/': { gamePage: false },
	'/login': { gamePage: false },
	'/createGame': { gamePage: false },
	'/startGame': { gamePage: true },
	'/joinGame': { gamePage: false },
	'/game': { gamePage: true },
}


// Classes
class Player {
	/**
	 * @class
	 *
	 * @param {Number} id - The id of the player.
	 * @param {String} username - The username of the player.
	 * @param {Number} game - The id of the game the player is in.
	 * @param {Number} score - The players score.
	 * @property {Array.<Letter>} letters - The players letters.
	 */
	constructor(id, username, game) {
		this.id = id
		this.username = username
		this.game = game
		this.score = 0
		this.letters = []
	}

	takeLetter() {
		let gameLetters = games[this.game].lettersLeft

		let letterIndex = Math.floor(Math.random() * gameLetters.length)
		this.letters.push(gameLetters[letterIndex])
		gameLetters.splice(letterIndex, 1)
	}
}

class WordList {
	/**
	 * @class
	 *
	 * @param {number} id - The id of the word list.
	 * @param {string} name - The name of the word list.
	 * @param {Array.<string>} words - The words in the word list (default is an empty array).
	 */
	constructor(id, name, words = []) {
		this.id = id
		this.name = name
		this.words = words
	}
}

class Letter {
	/**
	 * @class
	 *
	 * @param {number} turn - The turn number when the letter was placed.
	 * @param {string} letter - The letter itself.
	 * @param {number} placedBy - The player who placed the letter.
	 */
	constructor(turn, letter, placedBy) {
		this.turn = turn
		this.letter = letter
		this.placedBy = placedBy
	}
}

class Turn {
	/**
	 * @class
	 *
	 * @param {number} player - The player's id.
	 * @param {number} turnNumber - The current turn number.
	 * @param {Array<{x:number, y:number, letter:Letter}>} letters - The letters available for the game.
	 * @param {number} score - The player's score.
	 */
	constructor(player, turnNumber, letters, score) {
		this.player = player
		this.turnNumber = turnNumber
		this.letters = letters
		this.score = score
	}
}

class Game {
	/**
	 * @class
	 *
	 * @param {number} id - The id of the game.
	 * @param {number} owner - The id of the owner of the game.
	 * @param {string} code - The code of the game.
	 * @param {string} status - The status of the game.
	 * @param {Object.<number, Player>} players - An object where keys are player's ids and values are instances of the Player class.
	 * @param {Array.<Array.<Letter | undefined>>} board - The board of the game.
	 * @param {number} turnNumber - The current turn number.
	 * @param {number} wordList - The id of the word list being used.
	 * @param {Array.<string>} lettersLeft - The letters left in the game.
	 * @param {Object.<number, number>} scores - An object to keep track of the scores of the players. Keys are player's ids and values are their scores.
	 * @param {Array.<Turn>} turns
	 */
	constructor(
		id,
		owner,
		code,
		status,
		players,
		board,
		turnNumber,
		wordList,
		lettersLeft,
		turns
	) {
		this.id = id
		this.owner = owner
		this.code = code
		this.status = status
		this.players = players
		this.board = board
		this.turnNumber = turnNumber
		this.wordList = wordList
		this.lettersLeft = lettersLeft
		this.turns = turns
	}
}

// Variables
let games = {}
let players = {}
let wordLists = {}
let highestGameId = 0
let highestWordListId = 0

// Functions
/**
 * Creates a new game board.
 * @returns {Array.<Array.<undefined>>} - The newly created game board.
 */
function createBoard() {
	return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => []));
}

/**
 * Creates an array of letters based on the STARTING_LETTERS object.
 *
 * @return {Array.<string>} The array of letters
 */
function createLetters() {
	let letters = []

	for (let letter of Object.keys(STARTING_LETTERS)) {
		for (let i = 0; i < STARTING_LETTERS[letter]; i++) {
			letters.push(letter)
		}
	}

	return letters
}

// Express Functions
function isAuthenticated(req, res, next) {
	if (!req.session.user) {
		res.redirect(`/login?redirectURL=${config.thisUrl}`)
		return
	}

	if (!PAGES[req.url]) {
		res.render('pages/message', {
			title: 'Error',
			message: 'Page is not in the pages list.'
		})
		return
	}

	if (req.session.user.game) {
		let game = games[req.session.user.game]

		if (game.status == 'started' && req.url != '/game') res.redirect('/game')
		else if (game.status == 'waiting' && req.url != '/startGame') res.redirect('/startGame')
		else {
			next()
			return
		}

		return
	} else {
		if (PAGES[req.url].gamePage) {
			res.redirect('/')
			return
		}
	}

	next()
}

// Endpoints
app.get('/', isAuthenticated, (req, res) => {
	res.render('pages/index', {
		title: 'Home'
	})
})

app.get('/login', async (req, res) => {
	if (req.query.token) {
		let tokenData = jwt.decode(req.query.token)

		req.session.user = {
			id: tokenData.id,
			username: tokenData.username,
			game: null
		}
		req.session.save()

		res.redirect('/')
	} else {
		res.redirect(`${config.formbarUrl}/oauth?redirectURL=${config.thisUrl}/login`)
	}
})

app.get('/createGame', isAuthenticated, (req, res) => {
	res.render('pages/createGame', {
		title: 'Create Game',
		wordLists: Object.values(wordLists)
	})
})

app.post('/createGame', isAuthenticated, (req, res) => {
	let { wordList } = req.body

	wordList = parseInt(wordList)

	highestGameId++

	let key = ''
	for (let i = 0; i < 1; i++) {
		let keygen = 'abcdefghijklmnopqrstuvwxyz123456789'
		let letter = keygen[Math.floor(Math.random() * keygen.length)]
		key += letter
	}

	// games[highestGameId] = new Game(
	//  highestGameId,
	//  req.session.user.id,
	//  key,
	//  'waiting',
	//  {},
	//  createBoard(),
	//  1,
	//  wordList,
	//  createLetters(),
	//  {},
	//  []
	// )

	// testing
	games[highestGameId] = new Game(
		highestGameId,
		req.session.user.id,
		key,
		'waiting',
		{},
		Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => {
			let cell = []
			let amount = Math.floor(Math.random() * 6)

			for (let i = 0; i < amount; i++) {
				cell.push(new Letter(i, 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)], 0))
			}

			return cell
		})),
		1,
		wordList,
		createLetters(),
		{},
		[]
	)

	games[highestGameId].players[req.session.user.id] = new Player(
		req.session.user.id,
		req.session.user.username,
		highestGameId
	)

	//testing
	for (let i = Object.keys(games[highestGameId].players).length + 1; i <= 4; i++) {
		let name = ''
		for (let j = 0; j < 10; j++) {
			let keygen = 'abcdefghijklmnopqrstuvwxyz123456789'
			let letter = keygen[Math.floor(Math.random() * keygen.length)]
			name += letter
		}

		games[highestGameId].players[i] = new Player(
			i,
			name,
			highestGameId
		)
	}

	req.session.user.game = highestGameId
	req.session.save()

	res.redirect('startGame')
})

app.get('/startGame', isAuthenticated, (req, res) => {
	res.render('pages/startGame', {
		title: 'Start Game',
		gameCode: games[req.session.user.game].code,
		owner: games[req.session.user.game].owner == req.session.user.id,
		currentUser: JSON.stringify(req.session.user)
	})
})

app.post('/joinGame', isAuthenticated, (req, res) => {
	let { gameCode } = req.body
	gameCode = gameCode.toLowerCase()

	let gameId = false

	for (let game of Object.values(games)) {
		if (game.code == gameCode) {
			gameId = game.id
			break
		}
	}

	if (!gameId) {
		userSockets[req.session.user.id].emit('message', 'There is no open game with that code.')
		res.redirect('/')
		return
	}

	req.session.user.game = gameId
	req.session.save()

	games[gameId].players[req.session.user.id] = new Player(
		req.session.user.id,
		req.session.user.username,
		gameId
	)

	io.to(`game-${req.session.user.game}`).emit('getPlayers', games[req.session.user.game].players)

	res.redirect('/startGame')
})

app.get('/game', isAuthenticated, (req, res) => {
	try {
		res.render('pages/game', {
			title: 'Game',
			game: games[req.session.user.game],
			currentUser: games[req.session.user.game].players[req.session.user.id]
		})
	} catch (err) {
		console.error(err);
	}
})

// Socket.io
let userSockets = {}

io.on('connection', (socket) => {
	try {
		let user = socket.request.session.user

		if (user) {
			if (user.id) userSockets[user.id] = socket

			socket.join(`user-${user.id}`)
			socket.join(`game-${user.game}`)
		}
	} catch (err) {
		console.error(err)
	}

	// Socket.io functions
	function kickPlayer(gameId, userId) {
		let game = games[gameId]
		let userSocket = userSockets[userId]

		if (!userSocket) return

		userSocket.leave(`game-${socket.request.session.user.game}`)
		userSocket.request.session.user.game = null
		userSocket.request.session.save()

		delete game.players[userId]

		io.to(`user-${userId}`).emit('reload')
	}

	socket.on('getPlayers', () => {
		socket.emit('getPlayers', games[socket.request.session.user.game].players)
	})

	socket.on('kickPlayer', (userId) => {
		let game = games[socket.request.session.user.game]

		if (game.owner != socket.request.session.user.id) {
			socket.emit('message', 'You cannot kick people from a game you do not own.')
			return
		}

		if (userId == socket.request.session.user.id) {
			socket.emit('message', 'You cannot kick yourself.')
			return
		}

		kickPlayer(socket.request.session.user.game, userId)

		io.to(`game-${socket.request.session.user.game}`).emit('getPlayers', games[socket.request.session.user.game].players)
	})

	socket.on('leaveGame', () => {
		let gameId = socket.request.session.user.game

		if (games[gameId].owner == socket.request.session.user.id) {
			socket.emit('message', 'You cannot leave you own game.')
			return
		}

		kickPlayer(gameId, socket.request.session.user.id)

		io.to(`game-${gameId}`).emit('getPlayers', games[gameId].players)
	})

	socket.on('endGame', () => {
		let gameId = socket.request.session.user.game

		if (games[gameId].owner != socket.request.session.user.id) {
			socket.emit('message', 'You cannot end a game you do not own.')
			return
		}

		for (let player of Object.values(games[gameId].players)) {
			kickPlayer(gameId, player.id)
		}

		delete games[gameId]
	})

	socket.on('startGame', () => {
		let game = games[socket.request.session.user.game]
		game.status = 'started'

		for (let i = 0; i < 7; i++) {
			for (let player of Object.values(game.players)) {
				player.takeLetter()
			}
		}

		io.to(`game-${game.id}`).emit('reload')
	})
})

http.listen(PORT, async () => {
	await new Promise((resolve, reject) => {
		db.get(`SELECT * FROM word_list WHERE id = 1`, (err, defaultWordList) => {
			if (err) {
				reject(err)
			} else {
				wordLists[defaultWordList.id] = new WordList(
					defaultWordList.id,
					defaultWordList.name,
					JSON.parse(defaultWordList.words)
				)

				resolve(true)
			}
		})
	})

	console.log(`Listening on port ${PORT}`)
})