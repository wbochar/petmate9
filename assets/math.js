
module.exports = {
    sintab: ({}, len, scale) => {
        const res = Array(len).fill(0).map((v,i) => Math.round(Math.sin(i/len * Math.PI * 2.0) * scale));
        return res;
    }
}
