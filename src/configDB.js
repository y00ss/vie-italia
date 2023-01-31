const {MongoClient} = require("mongodb");

const URI = "mongodb://127.0.0.1:27017";

const client = new MongoClient(URI);

let ita_street;



//connection db
async function run() {
    try {

        // Establish and verify connection
        const db = client.db("streetAPI");
        ita_street = db.collection('ita_street');

        console.log("Connected successfully to server DB");

        //await ita_street.insertOne({description: "first insert"});
        console.log("Collection ita_street " + ita_street);

    } finally {
        // Ensures that the client will close when you finish/error
        //  await client.close();
    }
}


const getURI = () => {return URI};