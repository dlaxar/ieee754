(function(module) {

    /**
     * Enables filtered logging. The filter level is bound by `this`
     *
     * @param obj
     * @param level
     * @constructor
     */
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

    /**
     * This is a binary float system mathing the IEEE 754 specification
     * (with different bitwidths).
     *
     * @param p
     * @param eMin
     * @param eMax
     * @param denorm
     * @param options
     * @constructor
     */
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

    /**
     * Compute the parameters for the system. Intended for internal use
     */
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
     * Converts a number in a base that is a power of two into the system
     *
     * @param {String} number
     * @param {Number} base
     * @returns {BinaryFloatNumber}
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

    /**
     * Converts a decimal number into excess representation
     *
     * @param {Number} decimal
     * @returns {Number}
     */
    BinaryFloatSystem.prototype.excessify = function(decimal) {
        return this.k + decimal;
    };

    /**
     * Converts a decimal excess representation into a normal decimal representation
     *
     * @param {Number} decimal
     * @returns {number}
     */
    BinaryFloatSystem.prototype.dexcessify = function(decimal) {
        return decimal - this.k;
    };

    /**
     * Converts any decimal integer to binary with a given width
     *
     * @param {Number} decimal
     * @param {Number} width
     * @returns {string} the binary representation
     */
    BinaryFloatSystem.intToBinary = function(decimal, width) {
        var memo = new Array(width);
        memo.fill(0);

        var bin = parseInt(decimal).toString(2).split('');
        bin.unshift(width - bin.length, bin.length);
        memo.splice.apply(memo, bin);
        return memo.join('');
    };

    /**
     * Utility function to compare two systems. Systems are considered equal if p, eMin, eMax and denorm
     * are equal
     *
     * @param bfs
     * @returns {boolean}
     */
    BinaryFloatSystem.prototype.equals = function(bfs) {
        if(bfs instanceof BinaryFloatSystem) {
            return this.p == bfs.p && this.eMax == bfs.eMax && this.eMin == bfs.eMin && this.denorm == bfs.denorm;
        }
        return false;
    };


    /**
     * This is a float number represented in the IEEE 754 compatible system.
     * It uses round to nearest utilizing 3 guard bits
     * (GRS) and uses round-away-from-zero for tie cases.
     *
     * @param {BinaryFloatSystem} system
     * @param {Number} sign
     * @param {Number[]} mantissa - implicit!
     * @param {Number} exponent - not in excess representation!
     * @constructor
     */
    function BinaryFloatNumber(system, sign, mantissa, exponent) {
        this.system = system;
        this.sign = sign;
        this.mantissa = mantissa;
        this.exponent = exponent;
    }

    /**
     * Creates and returns a BinaryFloatNumber by it's IEEE 754 array representation as it
     * would be returned by .toArray()
     *
     * @param {BinaryFloatSystem} system
     * @param {Number[]} a
     * @returns {BinaryFloatNumber}
     */
    BinaryFloatNumber.createByArray = function(system, a) {
        var sign = a[0];
        var exp = system.dexcessify(parseInt(a.slice(1, system.structure.exponent+1).join(''), 2));
        var mantissa = a.slice(system.structure.exponent+1);

        return new BinaryFloatNumber(system, sign, mantissa, exp);
    };

    /**
     * Creates and returns a BinaryFloatNumber using an explicit mantissa
     * by rounding after checking for edgecases:
     *
     * <ul>
     *     <li>exponent too big -> inifinity (sign aware)</li>
     *     <li>exponent too small -> if denorm is allowed try to denorm, return IEEE 754 0 otherwise</li>
     * </ul>
     *
     * @param {BinaryFloatSystem} system
     * @param {Number} sign
     * @param {Number[]} explicitMantissa - this is an explicit mantissa!
     * @param {Number} exponent - not in excess representation!
     */
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

    /**
     * Creates and returns a BinaryFloatNumber using an implicit mantissa by rounding and
     * assuming that there are no edgecases.
     *
     * @param {BinaryFloatSystem} system
     * @param {Number} sign
     * @param {String[]} mantissa - this mantissa is implicit. Strings are allowed as long as they parse to 1/0
     * @param {Number} exponent
     * @returns {BinaryFloatNumber}
     */
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

            // todo make rounding modular
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

    /**
     * Returns an IEEE 754 zero matching system
     *
     * @param {BinaryFloatSystem} system
     * @param {Number} sign
     * @returns {BinaryFloatNumber}
     */
    BinaryFloatNumber.getZero = function(system, sign) {
        var mantissa = new Array(system.structure.mantissa);
        mantissa.fill(0);
        return new BinaryFloatNumber(system, sign, mantissa, system.eMin - 1);
    };

    /**
     * Returns an IEEE 754 Infinity matching system
     *
     * @param {BinaryFloatSystem} system
     * @param {Number} sign
     * @returns {BinaryFloatNumber}
     */
    BinaryFloatNumber.getInfinity = function(system, sign) {
        var mantissa = new Array(system.structure.mantissa);
        mantissa.fill(0);
        return new BinaryFloatNumber(system, sign, mantissa, system.eMax + 1);
    };

    /**
     * This method returns the exponent that should be used to compute
     * e.g. if the exponent is eMin - 1 this method will return eMin
     */
    BinaryFloatNumber.prototype.getExponent = function() {
        return Math.max(this.system.eMin, this.exponent);
    };

    /**
     * Returns the implicit bit
     *
     * @returns {number}
     */
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

            var resultExp = Math.max(this.getExponent(), b.getExponent());

            // overflow
            if(carry > 0) {
                resultExp++;
                result.unshift(carry);
            }

            var significant = result.indexOf(1);
            if(significant < 0) {
                resultExp = this.system.eMin - 1;
            } else {
                resultExp = resultExp - significant;
                for(; significant > 0; significant--) {
                    result.shift();
                }
            }

            return BinaryFloatNumber.createByRoundingWithChecks(this.system, this.sign, result, resultExp);
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
        } else if(b.sign == 1 && aA.equals(aB) || this.sign == 1 && aA.equals(aB)) {
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

            var resultExp = Math.max(this.getExponent(), b.getExponent());

            if(carry > 0) {
                log('There was an overflow while subtracting ((' + this.toString() + ') - (' + b.toString() + '))', Logger.WARN);
            }

            var significant = result.indexOf(1);
            if(significant < 0) {
                resultExp = this.system.eMin - 1;
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

    /**
     * This function is intended for internal use only. It is used to prepare two numbers a and b for
     * arithmetic logic like adding and subtracting. It is assumend, that a and b are both BinaryFloatNumbers and
     * that they are in the same system.
     *
     * Note that this function does not alter the original numbers but instead returns (modified) copies.
     *
     * The function adapts the exponents of a and b (by shrinking the bigger exponent to match the smaller
     * one and adding the according bits to the mantissa).
     *
     * @param {BinaryFloatNumber} a
     * @param {BinaryFloatNumber} b
     * @returns {[{Array}, {Boolean}, {Array}, {Boolean}]} Returns explicit mantissa of a and sticky bit as first two
     * parameters, explicit mantissa and sticky bit of b as second two
     */
    BinaryFloatNumber.prepareArithmetics = function(a, b) {
        var deltaExp = a.getExponent() - b.getExponent();

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
     * Returns a copy of the current number but absolute (sign flag not set)
     *
     * @returns {BinaryFloatNumber}
     */
    BinaryFloatNumber.prototype.abs = function() {
        return new BinaryFloatNumber(this.system, 0, this.mantissa, this.exponent);
    };

    /**
     * Returns a copy of the current number but a negative (sign flag set)
     *
     * @returns {BinaryFloatNumber}
     */
    BinaryFloatNumber.prototype.negation = function() {
        return new BinaryFloatNumber(this.system, this.sign == 1 ? 0 : 1, this.mantissa, this.exponent);
    };

    /**
     * Checks if two numbers are equal
     *
     * Two numbers are considered equal if sign, exponent and mantissa are equal
     *
     * @param b
     * @returns {boolean}
     */
    BinaryFloatNumber.prototype.equals = function(b) {
        if(!(b instanceof  BinaryFloatNumber) || !this.system.equals(b.system)) {
            throw "Parameter is not compatible with equals";
        }

        return this.sign == b.sign && this.exponent == b.exponent && this.mantissa.join('') == b.mantissa.join('');
    };

    /**
     * Converts the data into a string representation matching the system. It would look like this:
     * [sign] [exp] [mantissa]
     *
     * @returns {string}
     */
    BinaryFloatNumber.prototype.toString = function() {
        return this.sign + ' ' + BinaryFloatSystem.intToBinary(this.system.excessify(this.exponent), this.system.structure.exponent) + ' ' + this.mantissa.join('');
    };

    /**
     * Returns a binary string representation of the number
     *
     * @param {bool} plus weather or not to display a positive sign
     * @returns {string}
     */
    BinaryFloatNumber.prototype.toFixed = function(plus) {
        var mantissa = this.mantissa.slice(0, this.mantissa.lastIndexOf(1)+1);
        var i, exponent = this.getExponent();

        if(exponent < 0) {
            i = exponent;
            mantissa.unshift(this.getImplicitBit());
            i++;

            for(; i < 0; i++) {
                mantissa.unshift(0)
            }
            mantissa.unshift('.');
        } else if(exponent == 0) {
            mantissa.unshift('.');
            mantissa.unshift(this.getImplicitBit());
        } else {
            if(exponent > mantissa.length) {
                for(i = exponent - mantissa.length; i > 0; i--) {
                    mantissa.push(0);
                }
            }

            mantissa.splice(exponent, 0, '.');
            mantissa.unshift(this.getImplicitBit());
        }

        return (this.sign == 1 ? '-' : plus ? '+' : '') + mantissa.join('');
    };

    /**
     * Returns an Array representation of the number matching the string representation given by toString()
     * but as array and without whitespace characters
     *
     * @returns {Array}
     */
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