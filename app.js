const express = require("express");
const app = express();
const serv = require("http").Server(app);
const io = require("socket.io")(serv);
const gameActions = require("./controllers/actions");

io.origins(['https://dixitfrontend.herokuapp.com']);

const cors = require("cors");
app.use(cors());

const SOCKET_LIST = [];
let rooms = [];

io.on("connection", (socket) => {
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    socket.on("connect-room", (data) => {
        /// pega informações do usuário e armazena no socket
        const { username, code } = data;
        socket.room = code;
        socket.username = username;

        /// procura uma sala existente
        let existentRoom = getExistentRoom(code);
        let users = [];

        if (!existentRoom) {
            /// Se não tem sala, cria uma
            rooms.push({
                id: code,
                usernames: [username],
                sockets: [socket],
                mod: socket,
                gameState: "waiting",
            });
            users.push(username);

            existentRoom = getExistentRoom(code);

            /// Dá mod para aquele que criou a sala
            socket.emit("update-players", users);
            socket.emit("auth-mod", true);
        } else {
            if (existentRoom.gameState !== "waiting") {
                socket.emit("force-disconnect");
                return;
            }
            rooms[rooms.indexOf(existentRoom)].usernames.push(username);
            rooms[rooms.indexOf(existentRoom)].sockets.push(socket);
            const actualSite = getExistentRoom(code);
            const { usernames } = existentRoom;

            /// Dá update nos players para os sockets que estão no room
            actualSite.sockets.forEach((s) => {
                s.emit("update-players", usernames);
            });
        }

        gameActions(socket, existentRoom);
    });

    socket.on("disconnect", () => {
        /// Tira o socket da lista e identifica a sala que o socket estava
        delete SOCKET_LIST[socket.id];
        const existentRoom = getExistentRoom(socket.room);
        const index = rooms.indexOf(existentRoom || 0);

        let moderator = socket.id === existentRoom.mod.id;

        /// Se não existe a sala, ele volta
        if (!existentRoom) return;

        /// Remove o id e o username da sala
        existentRoom.sockets = existentRoom.sockets.filter(
            (value) => value.id !== socket.id
        );
        existentRoom.usernames = existentRoom.usernames.filter(
            (value) => value !== socket.username
        );
        existentRoom.sockets.forEach((s) => {
            s.emit("update-players", existentRoom.usernames);
        });

        /// Se estiver vazia a sala é apagada, senão o mod vai para outra pessoa
        if (existentRoom.sockets.length === 0) {
            rooms = rooms.splice(rooms[index], rooms[index]);
            return;
        } else {
            if (moderator) {
                existentRoom.mod = existentRoom.sockets[0];
                existentRoom.sockets[0].emit("auth-mod", true);
            }
        }
    });
});

serv.listen(2000);

function getExistentRoom(code) {
    return rooms.find((room) => room.id === code);
}
