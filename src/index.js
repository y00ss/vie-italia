const PORT = 8000;

const axios = require('axios');
const http = require('http');
const https = require('https');

const express = require('express');
const cheerio = require('cheerio');

const {MongoClient} = require("mongodb");


const URI = "mongodb://127.0.0.1:27017";
const client = new MongoClient(URI);

// no bueno
let ita_street;

run().catch(console.dir);

//connection db
async function run() {
    try {

        // Establish and verify connection
        const mongodb = client.db("streetAPI");
        ita_street = mongodb.collection('scraper_osm');

        console.log("Connesso to server DB");

        //await ita_street.insertOne({description: "first insert"});
        console.log("Collection ita_street " + ita_street);

    } finally {
        //  await client.close();
    }
}


// configuration axios call
module.exports = axios.create({
    //60 sec timeout
    //timeout: 600000,

    //keepAlive pools and reuses TCP connections, so it's faster
    httpAgent: new http.Agent({keepAlive: true}),
    httpsAgent: new https.Agent({keepAlive: true}),

    //follow up to 10 HTTP 3xx redirects
    maxRedirects: 10,

    //cap the maximum content length we'll accept to 50MBs, just in case
    // maxContentLength: 50 * 1000 * 1000
});


const nodo = [];

// app mio componente
const app = express();
const openalfa_url = 'https://vie.openalfa.it';


// utility
const timeToCall = function (page) {

    let $ = cheerio.load(page);
    let n_time = 1; // by default

    if ($('.wp-pagenavi', page).length > 0) {

        if ($('.last', page).text() !== '') {
            let txt = $('.last', page).attr('href');
            n_time = txt.match(/\d+/g);
            console.log("LAST " + n_time);
        } else {
            let value = $('.page.larger', page).get(-1);
            n_time = $(value).text();
            console.log(" NOT LAST " + n_time);

        }
    }
    return n_time;
}

const extractPage =
    $ => [
        ...new Set(
            $('.wp-pagenavi a') // Select pagination links
                .map((_, a) => $(a).attr('href')) // Extract the href (url) from each link
                .toArray() // Convert cheerio object to array
        )
    ];


// const getRegioni = async function (locale) {
//
//     let res = await axios.get(openalfa_url);
//
//     let html = res.data;
//     let $ = cheerio.load(html);
//
//     console.log("PRENDO REGIONI ");
//
//     $('#regions', html).each(function (index) {
//         $('.region', this).each(function (inde) {
//             console.log("INDICE REGIONE :  " + inde);
//             let name = $(this).text();
//             let url = openalfa_url + $(this).attr('href');
//
//             console.log("NOME REGIONE E URL " + name + url);
//             locale.push({
//                 name: name,
//                 url: url,
//                 province: null
//             })
//         });
//     });
//
//     return locale;
// }


const getProvince = async function (locale) {

    //Per la getAll (purtroppo va in timeout)
    /* await Promise.all(locale.map(
     * (it) => axios.get(it.url).then(response => {
     * */

    let response = await axios.get(locale.url);

    let html = response.data;
    let $ = cheerio.load(html);

    const province = [];

    $('#regions', html).each(function (index) {
        $('.columns', this).each(function (ind) {
            // Colpa del livello amministrativo.
            //Per il momento OK! È tardi per pensare
            if (ind === 0) {
                $('.region', this).each(function (inde) {

                    let name = $(this).text();
                    let url = openalfa_url + $(this).attr('href');

                    province.push({
                        name: name,
                        url: url,
                        comuni: null
                    })
                });
            }
        });
    });
    locale.province = province;

    return locale;
}

const getComuni = async function (locale) {

    await Promise.all(
        locale.province.map(async (prov) => {

            let response = await (axios.get(prov.url));
            let times = timeToCall(response.data);

            let comuni = [];
            for (let i = 1; i <= times; i++) {

                let url = prov.url + "?pg=" + i;
                //console.log("PRENDO I COMUNI DELLA PROVINCIA DI " + prov.name);
                let res = await axios.get(url);

                let html = res.data;
                let $ = cheerio.load(html);

                $('#regions', html).each(function () {
                    $('.columns', this).each(function (index) {
                        console.log("COMUNI INDEX " + index);
                        $('.region', this).each(function () {

                            let name = $(this).text();
                            let url = openalfa_url + $(this).attr('href');

                            //console.log("NOME COMUNE " + name);

                            comuni.push({
                                name: name,
                                url: url,
                                strade: null
                            })
                        })
                    })
                });
            }
            prov.comuni = comuni;
        }));
    return locale;
}

// [array di url (paginazione) ]
const stradeByComune = async (comune, timesToCall) => {

    let strade;

    //console.log("LUNGHEZZA " + timesToCall);

    // builder dell'array di url
    const streetPagesUrl =
        (Array(parseInt(timesToCall))
            .fill()
            .map((_, i) => comune.url + "?pg=" + (i + 1)));

    console.log("ARRAY " + JSON.stringify(streetPagesUrl));
    console.log("ARRAY lunghezza " + (streetPagesUrl).length);

    // array di response, tutte corrispondono ad un comune
    const response = await Promise.all(
        streetPagesUrl
            .map(async url => {

                //console.log("COMUNE  " + JSON.stringify(url));
                // await new Promise(r => setTimeout(r, 2000));
                return (await axios.get(url)).data;
            }))

    console.log("LUNGHEZZA DI RESPNSE " + response.length);

    strade = await parselStrade(response);
    await new Promise(r => setTimeout(r, 5000));

    return strade;
}


// ritorna l'array di strade
const parselStrade = async (data) => {

    let html = data.toString();
    let $ = cheerio.load(html);

    // catturo tutte le strade del comune
    let strade = [];
    $('.street-columns', html).each(function () {
        $('li , input', this).each(function () {

            let name = $(this).text().toString();

            // tolgo la descrizione. Possibile utilizzo futuro
            let desc = $(this).toString().match(/\((.*?)\)/g);

            if (desc) {
                console.log("DESCRIZIONE STRADA " + desc + "CON NOME " + name);
                name = name.replace(desc, '');
            }
            console.log("PRENDO I NOMI " + name);

            let way_id = $(this).toString().match((/\d+/g));
            // console.log("NOME STRADA " + name);
            if (name.length > 1) { // :[
                strade.push({
                    ops_way_id: way_id[1],
                    name: name
                })
            }
        })
    });
    return strade;
}

async function getUniqueListBy(arr, key) {
    return [...new Map(arr.map(item => [item[key], item])).values()]
}

// Funzione che estrapola nomi delle strade (vie, corsi, piazze .. )
// passando come paramentro obj provincia contenente tutti i comuni appertenenti
const getStrade = async function (locale) {

    await Promise.all(
        locale.province.map(async (prov) => {
            await Promise.all(prov.comuni.map(async (c) => {

                let strade;

                let res = await axios.get(c.url);
                const times = timeToCall(res.data);

                if (times === 1) {
                    strade = await parselStrade(res.data); // singol call
                } else {
                    strade = await stradeByComune(c, times); // multi call
                }

                let stradeUnique = await getUniqueListBy(strade, "name");

                c.strade = stradeUnique;

                console.log("STRADE UNICHE :" + stradeUnique);

                // piano con le richieste
                await new Promise(r => setTimeout(r, 1000));
            }))
        })
    )
    console.log("Completato raccolta strade");
    return locale;
}


/*todo vedere script python
const callIstatData = function (regione) {


    let origin_url = "demo.istat.it";
    let search_url = "https://demo.istat.it/app/RPCCerca.php";

    let header = {
        'Content-Length': 125,
        'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8",
        'Host': origin_url
    }

    let httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        requestCert: false,
        agent: false,
    });

    let provincia = "058";// # codice
    let mese = "8"; // # n mese

    let payload = 'territorio=procom&province=' + provincia + '&mese=' + mese + '&hid-i=D7B' +
        '&hid-a=2022&hid-l=it&hid-cat=D7B&hid-dati=dati-form-1&hid-tavola=tavola-form-1';


    return axios.post(search_url, payload, {
        headers: header, httpsAgent: httpsAgent
    })
        .then((response) => {
            console.log("RESPONSE " + response.data)
        })

        .catch((error) => {
            console.log("errore " + error.toString())
        });
}*/

// welcome
app.get('/', async (req, res) => {

    res.json("Welcome to Vie Italia API")
})

/**
 * Endpoint che ritorna tutte le strade appartenenti alla regione, con parametro nomeRegione
 * */
app.get('/regione/:nomeRegione', async (req, res) => {

    const nodo_json = [];
    const nome_regione = req.params.nomeRegione;

    nodo_json.push({
        name: nome_regione,
        url: openalfa_url + "/" + nome_regione,
        province: null
    });

    const obj = nodo_json[0];

    console.log("REGIONE : " + nome_regione);

    console.log("Caricamento province...");
    await getProvince(obj);

    console.log("Caricamento comuni...");
    await getComuni(obj);

    //console.log(JSON.stringify(obj));
    //await  stradeByComune(obj.province[4].comuni[96], 172)

    console.log("Caricamento strade...");
    await getStrade(obj);


    await ita_street.insertOne(obj);

    res.json(nodo_json);

    await client.close();
})


app.get('/italia/:nomeRegione/:idProv/:nomeProvincia', async (req, res) => {

    const nodo_json = [];
    const nome_regione = req.params.nomeRegione;
    const nome_provincia = req.params.nomeProvincia;
    const id_prov = req.params.idProv;

    let province = [{
        id: id_prov,
        name: nome_provincia,
        url: openalfa_url + "/" + nome_provincia,
        comuni: null
    }]


    nodo_json.push({
        name: nome_regione,
        url: openalfa_url + "/" + nome_regione,
        province: province
    });

    const obj = nodo_json[0];

    console.log("REGIONE : " + nome_regione);
    console.log("PROVINCIA : " + nome_provincia);


    console.log("Caricamento comuni...");

    await getComuni(obj);

    await getStrade(obj);

    let query = {
        name: nome_regione
    };

    // .toArray() per multi document
    let oldObj = await ita_street.findOne(query);


    // console.log("FIND " + JSON.stringify(oldObj))

    let newObj = obj;
    if (oldObj === null) {
        console.log("Non esistente" + JSON.stringify(oldObj));
    } else {

        console.log("FIND " + oldObj._id)


        let index = oldObj.province.findIndex(prov => prov.id === id_prov);

        console.log("STAMPO INDEX " + index);

        if (index !== -1) {

            obj.province[0].comuni.forEach(c =>
                oldObj.province[index].comuni.push(c))
        } else {
            oldObj.province.push(obj.province[0])
        }

        await ita_street.deleteOne({_id: oldObj._id})
        delete oldObj['_id'];

        newObj = oldObj;
        //
    }

    console.log("TOTALE COMUNI PER LA PROVINCIA DI " + nome_provincia + " SONO DI " + obj.province[0].comuni.length);

    newObj = await ita_street.insertOne(newObj);

    res.json(newObj);

    //  await client.close();
})

/**
 * Endpoint per ottenere tutte le strade di uno specifico comune
 * */
app.get('/italia/:nomeRegione/:nomeProvincia/:nomeComune', async (req, res) => {

    const nodo_json = [];
    const nome_regione = req.params.nomeRegione;
    const nome_provincia = req.params.nomeProvincia;
    const nome_comune = req.params.nomeComune;


    let comune = [{
        name: nome_comune,
        url: openalfa_url + "/" + nome_comune,
        strade: null
    }]

    let province = [{
        name: nome_provincia,
        url: openalfa_url + "/" + nome_provincia,
        comuni: comune
    }]


    nodo_json.push({
        name: nome_regione,
        url: openalfa_url + "/" + nome_regione,
        province: province
    });

    const obj = nodo_json[0];

    console.log("REGIONE : " + nome_regione);
    console.log("PROVINCIA : " + nome_provincia);


    console.log("Caricamento comuni...");

    await getComuni(obj);

    await getStrade(obj);

    let query = {name: nome_regione};

    // .toArray() per multi document
    console.log("INTERROGO IL DB ");
    let oldObj = await ita_street.findOne(query);


    // console.log("FIND " + JSON.stringify(oldObj))

    let newObj;
    if (oldObj === null) {
        console.log("Non esistente" + JSON.stringify(oldObj));
        newObj = obj;
    } else {
        console.log("FIND " + oldObj._id)


        console.log("ELIMINATO ID " + oldObj._id);
        console.log("NOME PROVINCIA " + nome_provincia)

        // verifico con l'url, il nome e' diverso da come salvatpo ecc ..
        let url_prov = openalfa_url + "/" + nome_provincia

        let index = (oldObj.province.findIndex(prov => prov.name === nome_provincia));


        if (index === undefined || index === null || index === -1) {
            oldObj.province.push(obj.province[0]);
        } else {
            oldObj.province[index].comuni.push(
                obj.province[0].comuni[0]
            )
        }


        // elimino dal db
        //await ita_street.deleteOne({_id: oldObj._id})

        // elimino id dal json
        delete oldObj['_id'];

        newObj = oldObj;
    }

    //await ita_street.insertOne(newObj);

    res.json(newObj);

    //  await client.close();
})


/**
 * Effetture sraping contemporaneamente crea un timeout da parte openalfa.
 *
 * */
/*app.get('/italia', async (req, res) => {

    const nodo_json = [];
    const province = [];

    const nome_regione = req.params.nomeRegione;
    const nome_provincia = req.params.nomeProvincia;

    province.push({
        name: nome_provincia,
        url: openalfa_url + "/" + nome_provincia,
        comuni: null
    })

    nodo_json.push({
        name: nome_regione,
        url: openalfa_url + "/" + nome_regione,
        province: null
    });


    const obj = nodo_json[0];


    //await getRegioni(obj);

    //console.log("Caricamento province...");
    await getProvince(obj);

    //console.log("Caricamento comuni...");
    await getComuni(obj);

    console.log("Caricamento stradario...");
    await getStrade(obj);

    //console.log("VISUALIZZAZIONE DATI :\n" + JSON.stringify(obj));
    res.json(obj);

}) */


// ascolto sulla porta 8000
app.listen(PORT, () => console.log('Server is running on PORT', PORT));