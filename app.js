// Imported modules
const express = require('express')
const session = require('express-session')
const sqlite3 = require('sqlite3').verbose()


// Setup
let db = new sqlite3.Database('database/database.db')

var app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

app.set('view engine', 'ejs')

var sessionMiddleware = session({
	secret: crypto.randomBytes(256).toString('hex'),
	resave: false,
	saveUninitialized: false
})

app.use(sessionMiddleware)

io.use((socket, next) => {
	sessionMiddleware(socket.request, socket.request.res || {}, next)
})

app.use(express.urlencoded({ extended: true }))

app.use(express.static(__dirname + '/static'))

// Constants
const PORT = 3000

// Classes

// Variables

// Functions

// Endpoints
app.get('/', (req, res) => {
	res.render('index')
})

http.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`)
})