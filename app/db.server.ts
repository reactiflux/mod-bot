import knex from "knex";
import knexfile from "../knexfile";

const environment = process.env.NODE_ENV || "development";
const config = knexfile[environment];

console.log({ config, environment });

export default knex(config);
