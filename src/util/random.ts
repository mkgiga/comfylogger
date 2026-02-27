
let a = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/**
 * thank you github.com/ai/nanoid
 */
export const nanoid = (length = 21) => {
    let t = "";
    let r = crypto.getRandomValues(new Uint8Array(length));
    
    for (let n = 0; n < length; n++) {
        t += a[63 & r[n]];
    }

    return t;
};
