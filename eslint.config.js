const globals = require("globals");

module.exports = [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                AABB: "readonly",
            }
        },
        rules: {
            "no-undef": "error"
        }
    }
];