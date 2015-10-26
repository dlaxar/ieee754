(function(module) {

    var Logger = function(obj, level) {
        if(level) {
            if(level > this) {
                console.log(obj);
            }
        } else {
            console.log(obj);
        }
    };

    Logger.DEBUG = 1;
    Logger.MATH = 2;
    Logger.WARN = 3;
    Logger.OFF = 9999;

    var log;

    function BinaryFloatSystem(p, eMin, eMax, denorm, options) {
        this.p = p;
        this.eMin = eMin;
        this.eMax = eMax;
        this.denorm = denorm;
        this.k = null;
        this.structure = {
            sign: 1,
            exponent: -1,
            mantissa: -1
        };

        this.options = options || {
                logLevel: Logger.OFF
            };

        log = Logger.bind(this.options.logLevel);

        this.compute();
    }

    BinaryFloatSystem.prototype.compute = function() {
        var exponentRange = this.eMax - this.eMin + 1 /*zero*/ + 1 /* infinity */;
        if(this.denorm) {
            exponentRange++; /* for eMin -1 */
        }

        log('Exponent Range: ' + exponentRange, Logger.MATH);

        var binaryDigitsForExponent = Math.ceil(Math.log(exponentRange) / Math.log(2));

        log('Digits for Exponent: ' + binaryDigitsForExponent, Logger.MATH);

        var excess = -(this.eMin) + 1;

        log('Excess (k) for Exponent: ' + excess, Logger.MATH);

        this.structure.exponent = binaryDigitsForExponent;
        this.structure.mantissa = this.p -1;
        this.k = excess;
    };

    /**
     *
     * @param {String} number
     * @param {Number} base
     */
    BinaryFloatSystem.prototype.convert = function(number, base) {
        log('Converting number from base ' + base, Logger.DEBUG);

        // determine the sign
        var sign = 0;
        number = number.trim();
        if(number[0] == '+' || number[0] == '-') {
            sign = number[0] == '-' ? 1 : 0;
            number = number.substr(1);
        }

        // check how many bits we will need for each input digit
        var bitMapping = Math.log(base) / Math.log(2);

        if(bitMapping - Math.ceil(bitMapping) != 0) {
            log('Can only convert from base that is multiple of 2! Aborting.', Logger.WARN);
            throw "Not Implemented: base not multiple of 2";
        }

        log('One target bit is represented by ' + bitMapping + ' source bits.', Logger.MATH);

        /**
         * The point variable holds the index of the decimal point
         * @type {Number} point
         */
        var point = number.indexOf('.');

        /**
         * Weather or not this is a float number (otherwise it would be whole)
         * @type {boolean}
         */
        var float = (point >= 0);

        if(!float) {
            point = number.length;
        }

        /**
         * Holds the binary data
         * @type {Array}
         */
        var bits = new Array((number.length - (float ? 1 : 0)) * bitMapping);
        bits.fill(0);

        for(var i = 0; i < number.length; i++) {
            if(i == point) {
                continue;
            }

            var dec = parseInt(number[i], base).toString(2);
            for(var n = 0; n < dec.length; n++) {
                // since int.toString() returns the minimum number of digit make sure, to write in the latter ones eg
                // dec = "11" -> [0011] for HEX
                bits[((i < point) ? (i * bitMapping) : ((i-1) * bitMapping)) + (bitMapping - dec.length) + n] = dec[n];
            }
        }

        // the point variable is now pointing in the bits array
        point *= bitMapping;

        log('Binary: ' + bits.join(''), Logger.MATH);

        // first significant digit
        var significant = bits.indexOf('1');
        var exp = significant >= 0 ? point - significant - 1 : this.eMin - 1;

        log('Exponent: ' + exp, Logger.MATH);

        var mantissaImplicit;

        // all good
        if(exp <= this.eMax && exp >= this.eMin) {
            mantissaImplicit = bits.slice(significant+1);
            return BinaryFloatNumber.createByRounding(this, sign, mantissaImplicit, exp);

        // exponent too small
        } else if (exp < this.eMin) {
            if(this.denorm) {
                var deltaExp = this.eMin - exp;
                exp = this.eMin - 1;
                mantissaImplicit = bits.slice(significant);
                for(var i = 0; i < deltaExp - 1; i++) {
                    mantissaImplicit.unshift(0);
                }

                return BinaryFloatNumber.createByRounding(this, sign, mantissaImplicit, exp);

            } else {
                return BinaryFloatNumber.getZero(system, sign);
            }

        // exponent too big
        } else if (exp > this.eMax) {
            return BinaryFloatNumber.getInfinity(this, sign);
        }
    };

    BinaryFloatSystem.prototype.excessify = function(decimal) {
        return this.k + decimal;
    };

    BinaryFloatSystem.intToBinary = function(decimal, width) {
        var memo = new Array(width);
        memo.fill(0);

        var bin = parseInt(decimal).toString(2).split('');
        bin.unshift(width - bin.length, bin.length);
        memo.splice.apply(memo, bin);
        return memo.join('');
    };

    BinaryFloatSystem.prototype.equals = function(bfs) {
        if(bfs instanceof BinaryFloatSystem) {
            return this.p == bfs.p && this.eMax == bfs.eMax && this.eMin == bfs.eMin && this.denorm == bfs.denorm;
        }
        return false;
    };


    function BinaryFloatNumber(system, sign, mantissa, exponent) {
        this.system = system;
        this.sign = sign;
        this.mantissa = mantissa;
        this.exponent = exponent;
    }

    BinaryFloatNumber.createByRoundingWithChecks = function(system, sign, explicitMantissa, exponent) {
        if (exponent > system.eMax) {
            return BinaryFloatNumber.getInfinity(system, sign);
        } else if(exponent < system.eMin) {
            if(system.denorm) {
                var significant = explicitMantissa.indexOf(1);
                var deltaExp = system.eMin - exponent;
                var exp = system.eMin - 1;
                var mantissaImplicit = explicitMantissa.slice(significant);
                for(var i = 0; i < deltaExp - 1; i++) {
                    mantissaImplicit.unshift(0);
                }

                return BinaryFloatNumber.createByRounding(system, sign, mantissaImplicit, exp);

            } else {
                return BinaryFloatNumber.getZero(system, sign);
            }
        } else {
            explicitMantissa.shift(); // get rid of explicit bit
            return BinaryFloatNumber.createByRounding(system, sign, explicitMantissa /* now is implicit */, exponent);
        }
    };

    BinaryFloatNumber.createByRounding = function(system, sign, mantissa, exponent) {
        mantissa = mantissa.map(function(x) {
            return parseInt(x);
        });

        var finalMantissa;
        if(mantissa.length <= system.structure.mantissa) {
            finalMantissa = new Array(system.structure.mantissa);
            finalMantissa.fill(0);
            var apply = mantissa;
            apply.unshift(0, mantissa.length);
            finalMantissa.splice.apply(finalMantissa, apply);
        } else {
            finalMantissa = mantissa.slice(0, system.structure.mantissa);
            var guard = mantissa[system.structure.mantissa];
            var round = (mantissa.length < system.structure.mantissa + 1) ? mantissa[system.structure.mantissa + 1] : 0;
            var sticky = mantissa.lastIndexOf(1) > system.structure.mantissa+2;

            if(guard == 1) {
                var carry = 0;
                if(round == 1 || sticky) {

                    // add 1
                    carry = 1;
                } else if(round == 0 && !sticky) {
                    carry = 1;
                }

                for(var i = finalMantissa.length - 1; i >= 0; i--) {
                    if(carry > 0) {
                        if(finalMantissa[i] == 0) {
                            finalMantissa[i] = carry;
                            carry = 0;
                        } else {
                            finalMantissa[i] = 0;
                        }
                    }
                }
                if(carry > 0) {
                    log('Overflow at rounding. Need to increase exponent!', Logger.MATH);
                    exponent++;

                    // When exponent gets too big the number is +infinity. To do so the
                    // mantissa needs to be 0 (would be NaN otherwise).
                    if(exponent > system.eMax) {
                        finalMantissa.fill(0);
                    }
                }
            }
        }

        return new BinaryFloatNumber(system, sign, finalMantissa, exponent);
    };

    BinaryFloatNumber.getZero = function(system, sign) {
        var mantissa = new Array(system.structure.mantissa);
        mantissa.fill(0);
        return new BinaryFloatNumber(system, sign, mantissa, system.eMin - 1);
    };

    BinaryFloatNumber.getInfinity = function(system, sign) {
        var mantissa = new Array(system.structure.mantissa);
        mantissa.fill(0);
        return new BinaryFloatNumber(system, sign, mantissa, system.eMax + 1);
    };

    BinaryFloatNumber.prototype.getImplicitBit = function() {
        return (this.exponent >= this.system.eMin) ? 1 : 0;
    };

    BinaryFloatNumber.prototype.plus = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with plus";
        }

        var aA = this.abs();
        var aB = b.abs();
        var x;

        if(this.sign == b.sign) {
            // normal addition
            var prepared = BinaryFloatNumber.prepareArithmetics(this, b);
            var mA = prepared[0], stickyA = prepared[1], mB = prepared[2], stickyB = prepared[3];


            var carry = 0;
            var t;
            var result = new Array(mA.length);
            for(var i = mA.length - 1; i >= 0; i--) {
                t = mA[i] + mB[i] + carry;
                carry = t > 1 ? 1 : 0;
                result[i] = t%2;
            }
            result.push((stickyA || stickyB) ? 1 : 0);

            var resultExp = Math.max(this.exponent, b.exponent);

            // overflow
            if(carry > 0) {
                resultExp++;
                result.unshift(carry);
            }

            if (resultExp > this.system.eMax) {
                return BinaryFloatNumber.getInfinity(this, sign);
            } else {
                result.shift();
                return BinaryFloatNumber.createByRounding(this.system, this.sign, result, resultExp);
            }
        } else if (b.sign == 1 && aB.lowerThan(this)) {
            x = this.minus(aB);
        } else if(b.sign == 1 && aB.greaterThan(this)) {
            // when |B| > |A| then A-|B|
            x = aB.minus(this);

            // flip sign
            x.sign = (x.sign == 1) ? 0 : 1;
        } else if(this.sign == 1 && aA.greaterThan(b)) {
            x = aA.minus(b);

            // flip sign
            x.sign = (x.sign == 1) ? 0 : 1;
        } else if(this.sign == 1 && aA.lowerThan(b)) {
            x = b.minus(aA);
        } else if(b.sign == 1 && this.equals(aB)) {
            x = BinaryFloatNumber.getZero(this.system, 0);
        }

        return x;
    };

    BinaryFloatNumber.prototype.minus = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with minus";
        }


        var aA = this.abs();
        var aB = b.abs();
        
        if(this.sign == 0 && aA.greaterThan(aB)) {
            // normal subtraction
            var prepared = BinaryFloatNumber.prepareArithmetics(this, b);
            var mA = prepared[0], stickyA = prepared[1], mB = prepared[2], stickyB = prepared[3];

            var carry = 0;
            var result = new Array(mA.length);
            for(var i = mA.length - 1; i >= 0; i--) {
                if(mB[i] + carry == 0) {
                    result[i] = mA[i];
                } else if(mA[i] == mB[i] + carry) {
                    result[i] = 0;
                    carry = 0;
                } else if(mA[i] - (mB[i] + carry) == -1) {
                    result[i] = 1;
                    carry = 1;
                } else if(mA[i] - (mB[i] + carry) == -1) {
                    result[i] = mA[i];
                    carry = 1;
                }
            }
            result.push(stickyA || stickyB ? 1 : 0);

            var resultExp = Math.max(this.exponent, b.exponent);

            if(carry > 0) {
                log('There was an overflow while subtracting ((' + this.toString() + ') - (' + b.toString() + '))', Logger.WARN);
            }

            var significant = result.indexOf(1);
            if(significant < 0) {
                resultExp = this.eMin - 1;
            } else {
                resultExp = resultExp - significant;
                for(; significant > 0; significant--) {
                    result.shift();
                }
            }

            return BinaryFloatNumber.createByRoundingWithChecks(this.system, this.sign, result, resultExp);
        } else {
            return this.plus(b.negation());
        }
    };

    BinaryFloatNumber.prototype.times = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with times";
        }

        var resultExp = this.exponent + b.exponent;
        var sign = this.sign ^ b.sign; // xor sign

        var mA = this.mantissa.slice(0);
        mA.unshift(this.getImplicitBit());

        var mB = b.mantissa.slice(0);
        mB.unshift(b.getImplicitBit());

        var result = new Array(mB.length + mA.length);
        var overflow = 0;
        var t;
        result.fill(0);

        for(var i = 0; i < mB.length; i++) {
            if(mB[i] == 1) {
                var carry = 0;
                for(var n = mA.length - 1; n >= (-i); n--) {
                    t = result[i+n] + (n < 0 ? 0 : mA[n]) + carry;
                    carry = t > 1 ? 1 : 0;
                    result[i+n] = t%2;
                }
                if(carry) {
                    overflow++;
                }
            }
        }

        if(overflow > 0) {
            resultExp++;
            result.unshift(overflow);
        }

        return BinaryFloatNumber.createByRoundingWithChecks(this.system, sign, result, resultExp);
    };

    BinaryFloatNumber.prototype.divide = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with divide";
        }

        var resultExp = this.exponent - b.exponent;
        var sign = this.sign ^ b.sign; // xor sign

        var mA = this.mantissa.slice(0);
        mA.unshift(this.getImplicitBit());

        var mB = b.mantissa.slice(0);
        mB.unshift(b.getImplicitBit());

        var precision = 1 /*implicit*/ + this.system.structure.mantissa + 1 /*g*/ + 1 /*r*/;

        var tmp = new Array(mA.length + precision);
        tmp.fill(0);
        var apply = mA.slice(0);
        apply.unshift(0, mA.length);

        tmp.splice.apply(tmp, apply);
        var result = [];
        for(var i = 0; i <= precision; i++) {
            if(parseInt(tmp.join('').substr(0, mA.length+i), 2) > parseInt(mB.join(''), 2)) {
                var carry = 0;
                for(var n = mB.length - 1; n >= (-i); n--) {
                    var indexTmp = n+i;
                    var digitB = mB[n] || 0;
                    if(digitB + carry == 0) {
                    } else if(tmp[indexTmp] == digitB + carry) {
                        tmp[indexTmp] = 0;
                        carry = 0;
                    } else if(tmp[indexTmp] - (digitB + carry) == -1) {
                        tmp[indexTmp] = 1;
                        carry = 1;
                    } else if(tmp[indexTmp] - (digitB + carry) == -1) {
                        tmp[indexTmp] = tmp[indexTmp];
                        carry = 1;
                    }
                }

                result.push(1);
            } else {
                result.push(0);
            }
        }

        if(tmp.reduce(function(m, i) {
                m += i;
            }, 0) > 0) {
            result.push(1 /*sticky*/);
        }

        var significant = result.indexOf(1);
        if(significant < 0) {
            resultExp = this.eMin - 1;
        } else {
            resultExp = resultExp - significant;
            for(; significant > 0; significant--) {
                result.shift();
            }
        }

        return BinaryFloatNumber.createByRoundingWithChecks(this.system, sign, result, resultExp);
    };

    BinaryFloatNumber.prepareArithmetics = function(a, b) {
        var deltaExp = a.exponent - b.exponent;

        var mantissaA = a.mantissa.slice(0);
        var mantissaB = b.mantissa.slice(0);

        mantissaA.unshift(a.getImplicitBit());
        mantissaB.unshift(b.getImplicitBit());

        // adapt exponents
        if(deltaExp < 0) {
            for(;deltaExp < 0; deltaExp++) {
                mantissaA.unshift(0);
            }
        } else if(deltaExp > 0) {
            for(;deltaExp > 0; deltaExp--) {
                mantissaB.unshift(0);
            }
        }

        var mA = mantissaA.slice(0, a.system.structure.mantissa);
        mA.push(mantissaA[a.system.structure.mantissa] || 0);
        mA.push(mantissaA[a.system.structure.mantissa+1] || 0);
        var stickyA = mantissaA.slice(a.system.structure.mantissa+2).reduce(function(memo, current) {
            return memo || current == 1;
        }, false);

        var mB = mantissaB.slice(0, a.system.structure.mantissa);
        mB.push(mantissaB[a.system.structure.mantissa] || 0);
        mB.push(mantissaB[a.system.structure.mantissa+1] || 0);
        var stickyB = mantissaB.slice(a.system.structure.mantissa+2).reduce(function(memo, current) {
            return memo || current == 1;
        }, false);

        return [mA, stickyA, mB, stickyB];
    };

    BinaryFloatNumber.prototype.lowerThan = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with lowerThan";
        }

        return this.sign >= b.sign &&
            (
                (this.exponent < b.exponent) ||
                (this.exponent == b.exponent && parseInt(this.getImplicitBit() + this.mantissa.join('')) < parseInt(b.getImplicitBit() + b.mantissa.join('')))
            );
    };

    BinaryFloatNumber.prototype.greaterThan = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with greaterThan";
        }

        return this.sign <= b.sign &&
            (
                (this.exponent > b.exponent) ||
                (this.exponent == b.exponent && parseInt(this.getImplicitBit() + this.mantissa.join('')) > parseInt(b.getImplicitBit() + b.mantissa.join('')))
            );
    };

    /**
     *
     * @returns {BinaryFloatNumber} number
     */
    BinaryFloatNumber.prototype.abs = function() {
        return new BinaryFloatNumber(this.system, 0, this.mantissa, this.exponent);
    };

    BinaryFloatNumber.prototype.negation = function() {
        return new BinaryFloatNumber(this.system, this.sign == 1 ? 0 : 1, this.mantissa, this.exponent);
    };

    BinaryFloatNumber.prototype.equals = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with equals";
        }

        return this.sign == b.sign && this.exponent == b.exponent && this.mantissa.join('') == b.mantissa.join('');
    };

    BinaryFloatNumber.prototype.toString = function() {
        return this.sign + ' ' + BinaryFloatSystem.intToBinary(this.system.excessify(this.exponent), this.system.structure.exponent) + ' ' + this.mantissa.join('');
    };

    BinaryFloatNumber.prototype.toFixed = function(plus) {
        var mantissa = this.mantissa.slice(0, this.mantissa.lastIndexOf(1)+1);
        var i;
        if(this.exponent < 0) {
            i = this.exponent;
            mantissa.unshift(this.getImplicitBit());
            i++;

            for(; i < 0; i++) {
                mantissa.unshift(0)
            }
            mantissa.unshift('.');
        } else if(this.exponent == 0) {
            mantissa.unshift('.');
            mantissa.unshift(this.getImplicitBit());
        } else {
            if(this.exponent > mantissa.length) {
                for(i = this.exponent - mantissa.length; i > 0; i--) {
                    mantissa.push(0);
                }
            }

            mantissa.splice(this.exponent, 0, '.');
            mantissa.unshift(this.getImplicitBit());
        }

        return (this.sign == 1 ? '-' : plus ? '+' : '') + mantissa.join('');
    };

    BinaryFloatNumber.prototype.toArray = function() {
        return this.toString().split('').filter(function(i) {
            return i != ' ';
        }).map(function(i) {
            return parseInt(i);
        });

    };




    // Exports
    module.BinaryFloatSystem = BinaryFloatSystem;
    module.BinaryFloatNumber = BinaryFloatNumber;
    module.Logger = Logger;


})(window);