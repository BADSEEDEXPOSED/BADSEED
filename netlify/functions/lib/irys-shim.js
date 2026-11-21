// Lightweight Cloudflare Workers shim for @irys/sdk (avoids pulling @near-js eval('require'))
class IrysShim {
  constructor(opts) {
    this.opts = opts;
  }
  async getLoadedBalance() {
    return { isLessThan: () => true, toString: () => '0' };
  }
  async getPrice() {
    return { toString: () => '0' };
  }
  async upload() {
    throw new Error('Irys edge upload deferred to Redis pending-archives');
  }
}
module.exports = IrysShim;
module.exports.default = IrysShim;
