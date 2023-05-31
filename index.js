const express = require("express")
const app = express()
const roblox = require("noblox.js")
const cache = require("cache-manager")
const randomkey = require("random-key")
const ratelimit = require("express-rate-limit")
const { parse } = require("dotenv")
require("dotenv").config()

let tokens

/**
 * 
 * @param { String } token 
 * @returns 
 */
function parseToken(token) {
    if (!token) return
    const infos = token.replace(/^\w+-/, "").split(/\-/)
    const randomkey = token.replace(/\-.*/, "")
    const parsed = new Object()
    parsed.key = Buffer.from(randomkey).toString("utf-8")
    parsed.id = parseInt(Buffer.from(infos[0], "base64").toString("utf-8"))
    parsed.username = Buffer.from(infos[1], "base64").toString("utf-8")
    return parsed
}

app.use(ratelimit({
    windowMs: 1 * 60 * 1000,
    max: async (req, res) => {
        if (req.headers.host == process.env.DEV) return 9e9
        else return 5
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, message: "Too Many Requests" }
}))
app.get('/ip', (request, response) => response.send(request.ip))
app.use((req, res, next) => {
    if (!req.headers["roblox-id"] && req.headers.host != process.env.DEV) return res.status(401).json({ code: 401, message: "Unauthorized" })
    next()
})

app.use("/api", (req, res, next) => {
    if (!req.headers["authorization"] || req.headers["authorization"] != process.env.API_AUTH) return res.status(401).json({ code: 401, message: "Unauthorized" })
    next()
})

app.get("/", (req, res) => {
    res.status(200).json({ code: 200, message: "OK" })
})

app.post("/api/v1/flostudio/superfan/newtoken", async (req, res) => {
    try {
        if (!req.headers["user-id"]) return res.status(400).json({ code: 400, message: "Bad Request" })
        const id = req.headers["user-id"]

        await roblox.getPlayerInfo(parseInt(id)).then(async info => {
            if (await tokens.get(id)) return res.status(401).json({ code: 401, message: "A token for this user already exists." })
            const key = randomkey.generateBase30(16)
            const token = `${key}-${Buffer.from(id, "utf-8").toString("base64")}-${Buffer.from(info.username, "utf-8").toString("base64")}`
            await tokens.set(id, token)
            console.log(`created new token for ${info.username} > ${token}`)
            return res.status(200).json({ code: 200, token: token })
        }).catch(error => {
            res.status(500).json({ code: 500, message: error.message })
            return console.error(error)
        })
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message })
        return console.error(error)
    }
})

app.post("/api/v1/flostudio/superfan/rank", async (req, res) => {
    try {
        if (!req.headers["token"]) return res.status(400).json({ code: 400, message: "Bad Request" })
        const infos = req.headers["token"].replace(/^\w+-/, "").split(/\-/), key = req.headers["token"].replace(/\-.*/, "")
        const token = new Object()
        token.key = Buffer.from(key).toString("utf-8")
        token.id = Buffer.from(infos[0], "base64").toString("utf-8")
        token.username = Buffer.from(infos[1], "base64").toString("utf-8")
        if (!token || !infos || !key || Object.keys(token).length < 3) return res.status(401).json({ code: 401, message: "Token invalid." })
        const cachedtoken = parseToken(await tokens.get(token.id) || null)
        if (!cachedtoken) return res.status(401).json({ code: 401, message: "Token invalid." })
        if (cachedtoken.key != token.key) return res.status(401).json({ code: 401, message: "Token invalid." })
        tokens.set(token.id, false)
        await roblox.getRankInGroup(process.env.GROUP_ID, parseInt(token.id)).then(async rank => {
            if (rank >= parseInt(process.env.RANK_TO)) return res.status(401).json({ code: 401, message: "User already ranked or current rank is too high." })
            await roblox.setRank(process.env.GROUP_ID, token.id, parseInt(process.env.RANK_TO)).then(newrank => {
                console.log(`${token.username} ranked to ${newrank.name} (${newrank.rank})`)
                return res.status(200).json({ code: 200, message: "User has been successfully ranked!", newrank: newrank })
            }).catch(error => {
                res.status(500).json({ code: 500, message: error.message })
                return console.error(error)
            })
        }).catch(error => {
            res.status(500).json({ code: 500, message: error.message })
            return console.error(error)
        })
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message })
        return console.error(error)
    }
})

app.get("/*", (req, res) => {
    res.status(404).json({ code: 404, message: "Not Found" })
})

app.listen(process.env.PORT, async () => {
    tokens = await cache.caching("memory", {
        max: 100,
        ttl: 1 * 10000
    })
    await roblox.setCookie(process.env.COOKIE).then(res => console.log(`Ranking user logged in > ${res.UserName}`)).catch(error => {
        console.error(error)
    })
    console.log(`Server listening on port ${process.env.PORT}*`)
})