// A module that provides credentials for accessing firebase services

const serviceAccount = {
  project_id: process.env.FIRE_PID,
  private_key: process.env.FIRE_PKEY.replace(/\\n/g, '\n'), // It is vital to replace '\\n' with '\n' because those escaped newlines(i.e. \n) in the original private key text are encoded again reuslted as '\\n', which is definitely wrong taken as private key.
  client_email: process.env.FIRE_CEMAIL,
  databaseURL: process.env.FIRE_DB_URL,
};

module.exports = serviceAccount;
