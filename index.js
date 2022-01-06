/*
NLI Book Downloader
v. 1.0
Developed by: Elkana Bardugo
Minor fixes: Rafi Hecht

Notes 2022-01-06 (Rafi Hecht):
- The only variable you need to change is the variable "id" which can be found in the NLI URL
- Run this script directly in node.js
*/

"use strict";

const http = require('http')
const fs = require('fs')
const path = require('path')
const axios = require("axios")
const prettyBytes = require('pretty-bytes')
const program = require('commander')

let id = "PNX_MANUSCRIPTS990000621610205171-1"

let METADATA_URL = 'https://web.nli.org.il/_layouts/15/NLI.DigitalItemPresentor/Mirador/web.nli.org.il/sites/NLIS/he/_vti_bin/NLI.DigitalItemPresentor/IIIFManifest.svc/GetManifestByDocID/'
let DOWNLOAD_URL = 'http://rosetta.nli.org.il/delivery/DeliveryManagerServlet?dps_func=stream&dps_pid='

let promises = []
let status = {
    active: 0,
    finish: 0,
    downloaded: 0
}

async function getMetadata(url) {
    try {
        const data = (await axios.get(url)).data
        if (data['Success']) {
            return data['Value']
        } else {
            console.log('Error: Metadata request report error:')
            console.error(data['ErrorMessage'])
        }
    } catch (error) {
        console.log('Error: Metadata request failed:')
        console.log(error.response)
    }
}

async function downloadFile(i, url, path) {
    const stream = fs.createWriteStream(path)
    const res = await new Promise((resolve) => {
        http.get(url, (res) => {
            resolve(res)
        })
    })

    let fileSize = 0
    let downloaded = 0
    res
        .on('request', (req) => {
            fileSize = req.headers['content-length']
        })
        .on('data', (chunk) => {
            downloaded += chunk.length
            // let percent = downloaded / fileSize * 100
            status.downloaded += chunk.length
        })

    return await Promise.all([
        new Promise((resolve, reject) => {
            res
                .on('end', () => resolve())
                .on('error', err => reject(err))
                .pipe(stream)
        }),
        new Promise((resolve, reject) => {
            stream
                .on('finish', () => resolve())
                .on('error', err => reject(err))
        })
    ])
}

async function processPart(i, url, path) {
    while (status.active >= 10) {
        await new Promise((resolve) => {
            setTimeout(() => resolve(), 500)
        })
    }
    status.active++
    let retries = 0
    while (retries < 3) {
        try {
            await downloadFile(i, url, path)
            retries = 4
            status.finish++
        } catch (err) {
            retries++
            console.error(`Error on downloading page ${i}, ${retries} retry.`)
        }
    }
    if (retries === 3) {
        console.log(`Failed to download / saving page ${i}, you can download it yourself from: ${url}`)
    }
    status.active--
}

function statusPrinter() {
    process.stdout.write(`\r${status.total} pages, ${status.finish} pages downloaded. Download ${prettyBytes(status.downloaded)} until now`)
}

async function start(url, folder) {
    if (!fs.existsSync(folder)) {
        console.log("folder doesn't exist, trying to create...")
        try {
            fs.mkdirSync(folder)
        } catch (err) {
            console.error('Error: folder creation failed.')
            console.error(err)
            process.exit(1)
        }
    }

    let data
    try {
        let data = JSON.parse(await getMetadata(url)).sequences[0].canvases
    } catch (err) {
        console.error('Error: failed to get data from NLI.')
        console.error(err)
        process.exit(1)
    }


    status.total = data.length
    for (let i in data) {
        let id = data[i].images[0]['@id']
        promises.push(processPart(i, DOWNLOAD_URL + id, path.join(folder, i + ".tiff")))
    }
    let statusWorker = setInterval(() => {
        statusPrinter()
    }, 500)
    try {
        await Promise.all(promises)
    } catch (err) {
        console.error('Error:', err)
        process.exit(1)
    }
    clearInterval(statusWorker)
}

if (require.main === module) {
    program
        .arguments('<book_id>')
        .action((arg) => {
            id = arg
        })
        .description('Download books from The National Library of Israel')
        .version('0.0.1')
        .option('-o, --output-folder <path>', 'path to the file download', './images_' + id)

        .parse(process.argv)

    start(METADATA_URL + id, program.outputFolder)
} else {
    console.log('required as a module')
}

