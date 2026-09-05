const { app, initializeServer } = require('../server');

let initialization;

module.exports = async (req, res) => {
    initialization ||= initializeServer().catch(error => {
        initialization = null;
        throw error;
    });
    await initialization;
    return app(req, res);
};