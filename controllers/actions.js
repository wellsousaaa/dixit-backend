const cards = require("./cards");

function main(socket, room) {
    socket.on("start-game", () => {
        if (socket.id !== room.mod.id) return;

        /// Clona o array, embaralha as cartas, randomiza os players
        /// envia as cartas para todos e decide o storyTeller.
        const newCards = cards.slice(0);
        room.gameState = "playing";
        room.cards = shuffle(newCards);
        room.sockets = shuffle(room.sockets);

        room.playerNumber = 0;
        room.storyTeller = room.sockets[room.playerNumber];

        const toSend = room.storyTeller.username;

        room.sockets.forEach((s) => {
            s.points = 0;
            const playerCards = [];
            for (let i = 0; i < 4; i++) {
                playerCards.push(room.cards[0]);
                room.cards = room.cards.splice(1);
            }

            s.emit("update-cards", playerCards);
            s.emit("update-turn", 1, toSend);
        });

        room.turnCard = getNewCard(room);
        room.storyTeller.emit("update-turn", 1.5, room.turnCard);
    });

    socket.on("send-description", (description) => {
        if (socket.id !== room.storyTeller.id) return;
        room.turnCards = {};

        /// Todos os sockets, com excessão do storyTeller recebem a descrição
        room.sockets.forEach((s) => {
            if (s.id !== room.storyTeller.id) {
                s.emit("update-turn", 2, description.toString());
            }
        });

        /// Guarda a carta do storyTeller para a votação
        room.turnCards[room.turnCard] = {
            number: room.turnCard,
            player: room.storyTeller,
            real: true,
            playerName: room.storyTeller.username,
            choosen: [],
        };
    });

    socket.on("send-card", (cardNumber) => {
        /// Guarda a carta escolhida
        room.turnCards[cardNumber] = {
            number: cardNumber,
            player: socket,
            real: false,
            playerName: socket.username,
            choosen: [],
        };
        socket.chosenCard = cardNumber;

        /// Se todos escolheram, continua o jogo
        if (Object.keys(room.turnCards).length === room.sockets.length) {
            const result = shuffle(Object.keys(room.turnCards));
            room.turnVotes = 0;
            room.sockets.forEach((s) => {
                s.emit("update-turn", 3, result);
            });
        }
    });

    socket.on("vote-card", (cardNumber) => {
        /// StoryTeller não vota
        if (socket.id === room.storyTeller.id) return;

        /// Guarda os votos no object da carta
        room.turnCards[cardNumber].choosen.push({
            socket,
            username: socket.username,
        });

        /// Se todos votaram, o jogo continua
        room.turnVotes += 1;
        if (room.turnVotes === room.sockets.length - 1) {
            const result = [];
            const toMap = Object.values(room.turnCards);

            /// Separa dados das cartas para poder mostrar os resultados da votação
            toMap.forEach((item) => {
                const { number, playerName, choosen, real } = item;
                const choices = [];
                choosen.forEach((item) => {
                    choices.push(item.username);
                });
                const votes = { number, playerName, choices, real };
                result.push(votes);
            });

            room.sockets.forEach((s) => {
                s.emit("update-turn", 4, result);
            });
        }
    });

    socket.on("next-turn", () => {
        if (socket.id !== room.mod.id) return;

        /// Analisa a vitória de alguém, e em quais cartas votaram
        let gameover = { isGameOver: false, winner: null };

        Object.values(room.turnCards).forEach((item) => {
            if (item.real) {
                /// Se ninguém votou na carta do storyTeller:
                if (item.choosen.length === room.sockets.length - 1) {
                    room.sockets.forEach((s) => {
                        if (s.id !== room.storyTeller.id) s.points += 3;
                    });
                }

                /// Se nem todo mundo votou na carta do storyTeller:
                else {
                    room.storyTeller.points += 3;
                    item.choosen.map((user) => {
                        user.socket.points += 3;
                    });
                }
            }

            /// Se votaram na sua carta achando que era o storyTeller:
            if (!item.real && item.choosen.length > 0) {
                item.player.points += item.choosen.length;
            }

            /// Analisa se alguém atingiu os pontos
            if (item.player.points >= 30 && !gameover.isGameOver)
                gameover = { isGameOver: true, winner: item.player };
        });

        /// Atualiza os pontos
        const points = [];
        room.sockets.forEach((s) => {
            const toPush = { username: s.username, points: s.points };
            points.push(toPush);
        });

        /// Atualiza se o jogo acabou
        room.sockets.forEach((s) => {
            if (gameover.isGameOver) {
                const indexOfUsername = room.usernames.indexOf(
                    gameover.winner.username
                );
                s.emit("game-over", gameover.winner.username);
                room.usernames[indexOfUsername] += " 👑";
                s.emit("update-players", room.usernames);
                room.gameState = "waiting";
            } else {
                s.emit("next-round", points);
            }
        });
    });

    socket.on("can-proceed", () => {
        if (socket.id !== room.mod.id) return;

        /// O jogo se prepara para o próximo turno
        const exStoryTellerId = room.storyTeller.id;
        room.playerNumber += 1;
        if (room.playerNumber >= room.sockets.length) room.playerNumber = 0;
        room.storyTeller = room.sockets[room.playerNumber];
        const toSend = room.storyTeller.username;

        room.sockets.forEach((s) => {
            if (s.id !== exStoryTellerId) {
                s.emit("get-card", getNewCard(room));
            }

            s.emit("update-turn", 1, toSend);
        });

        room.turnCard = getNewCard(room);
        room.storyTeller.emit("update-turn", 1.5, room.turnCard);
    });

    function shuffle(array) {
        let q, w, d;
        for (d = array.length - 1; d > 0; d--) {
            q = Math.floor(Math.random() * (d + 1));
            w = array[d];
            array[d] = array[q];
            array[q] = w;
        }

        return array;
    }
    function getNewCard(room) {
        const result = [room.cards[0]];
        room.cards = room.cards.splice(1);
        return result;
    }
}

module.exports = main;
