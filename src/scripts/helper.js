const { stringify } = require('querystring')
const uuid = require('uuid')

var uuidV4 = () => {
    return uuid.v4();
}

function randNumber(min, max) {
    var rand = Math.random() * (max - min) + min
    return stringify(rand);

}


module.exports = {uuidV4, randNumber}