const express = require("express")
const app = express()
const { engine } = require("express-handlebars")
const bodyParser = require("body-parser")
const ytdl = require("ytdl-core")
const ffmpeg = require("ffmpeg-static")
const cp = require("child_process")
const fs = require("fs")

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.engine("handlebars", engine())
app.set("view engine", "handlebars")
app.set("views", "./views")

app.use(express.static("public"))

app.get("/", (req, res) => {
	res.render("index")
})

app.get("/test", (req, res) => {
	res.send("Hello")
})

app.post("/send", (req, res) => {
	const { url } = req.body

	if (!ytdl.validateURL(url)) {
		return res.status(400).send("Bad video URL").end()
	}

	ytdl.getInfo(url).then(info => {
		const { thumbnails } = info.player_response.videoDetails.thumbnail

		thumbnails.sort((a, b) => b.width - a.width && b.height - a.height)

		res.render("video", {
			url,
			videoFormats: info.player_response.streamingData.adaptiveFormats.filter(
				fmt =>
					(fmt.qualityLabel !== null || fmt.qualityLabel !== undefined) &&
					(fmt.audioQuality === null || fmt.audioQuality === undefined) &&
					fmt.mimeType.includes("mp4")
			),
			audioFormats: info.player_response.streamingData.adaptiveFormats.filter(
				fmt =>
					(fmt.qualityLabel === null || fmt.qualityLabel === undefined) &&
					(fmt.audioQuality !== null || fmt.audioQuality !== undefined)
			),
			title: info.player_response.videoDetails.title,
			thumbnail: thumbnails[0],
		})
	})
})

app.post("/download", (req, res) => {
	const { video_url, audioq, videoq } = req.body

	const audio = ytdl(video_url, { quality: audioq })

	if (videoq == 0) {
		res.setHeader("Content-disposition", "attachment; filename=audio.mp3")
		audio.pipe(res)
		return
	}

	const video = ytdl(video_url, { quality: videoq })

	// Start the ffmpeg child process
	const ffmpegProcess = cp.spawn(
		ffmpeg,
		[
			// Remove ffmpeg's console spamming
			"-loglevel",
			"8",
			"-hide_banner",
			// Redirect/Enable progress messages
			"-progress",
			"pipe:3",
			// Set inputs
			"-i",
			"pipe:4",
			"-i",
			"pipe:5",
			// Map audio & video from streams
			"-map",
			"0:a",
			"-map",
			"1:v",
			// Keep encoding
			"-c:v",
			"copy",
			// Define output file
			"out.mp4",
			// "-f",
			// "matroska",
			// "pipe:6",
			// "out.mp4",
		],
		{
			windowsHide: true,
			stdio: [
				/* Standard: stdin, stdout, stderr */
				"inherit",
				"inherit",
				"inherit",
				/* Custom: pipe:3, pipe:4, pipe:5 */
				"pipe",
				"pipe",
				"pipe",
				// "pipe",
			],
		}
	)
	ffmpegProcess.on("close", () => {
		console.log("done")
		// Cleanup
		process.stdout.write("\n\n\n\n")
		// clearInterval(progressbarHandle)
		res.download("./out.mp4", function (err) {
			if (err) {
				console.log(err)
			}
			fs.unlink("./out.mp4", () => console.log("File deleted!"))
		})
	})

	// Link streams
	// FFmpeg creates the transformer streams and we just have to insert / read data
	ffmpegProcess.stdio[3].on("data", chunk => {
		// Parse the param=value list returned by ffmpeg
		const lines = chunk.toString().trim().split("\n")
		const args = {}
		for (const l of lines) {
			const [key, value] = l.split("=")
			args[key.trim()] = value.trim()
		}
		// tracker.merged = args
	})
	audio.pipe(ffmpegProcess.stdio[4])
	video.pipe(ffmpegProcess.stdio[5])
	// ffmpegProcess.stdio[6].pipe(res)
})

app.listen(3000)

module.exports = app
