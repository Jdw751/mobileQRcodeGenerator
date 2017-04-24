angular.module('barcode', [ 'common.validation', 'ngSanitize' ])

.controller('BarcodeController', function($scope, barcodeFactory) {
	var emptyForm = {
		birthDate : null,
		docNumber : '',
		docSubType : '',
		docType : null,
		expireDate : null,
		extraNumber : '',
		firstName : '',
		issueCountry : '',
		lastName : '',
		nationality : '',
		optNumber : '',
		sex : ''
	};
	$scope.form = angular.copy(emptyForm);
	$scope.mrz = null;

	// Compute MRZ when form changes
	$scope.$watchCollection('form', doMrz);

	// Clear subtype when doc type changes
	$scope.$watchCollection('form.docType', function changeDocType() {
		$scope.form.docSubType = '';
	});

	// Fill form with a random identity
	$scope.random = function random() {
		angular.extend($scope.form, barcodeFactory.getRandomId());
		if (!$scope.form.docType) {
			$scope.form.docType = $scope.docTypes[0];
		}
		if (!$scope.form.expireDate) {
			$scope.form.expireDate = +moment().tz('America/New_York').add(10, 'years');
		}
	};

	// Clear form
	$scope.clear = function clear() {
		$scope.form = angular.copy(emptyForm);
		$scope.form.docType = $scope.docTypes[0];
	};

	// Print
	$scope.print = function print() {
		window.print();
	};

	function doMrz() {
		$scope.mrz = null;
		if (!$scope.form.docType) {
			return;
		}

		// Use template to build MRZ string
		// Default to ICAO 2-line 44-character format
		var template = $scope.form.docType.template || TEMPLATE_MRZ2;
		var barcodeFields = barcodeFactory.buildbarcodeFields($scope.form);
		$scope.mrz = barcodeFactory.buildMrz(template, barcodeFields);
	}

	// Load reference data
	barcodeFactory.getRefData().then(function(refData) {
		$scope.countries = refData.countries;
		$scope.states = refData.states;
		$scope.visaClasses = refData.visaClasses;
		$scope.docTypes = refData.docTypes;

		// Initialize with random data
		$scope.random();
	});
})

.factory('barcodeFactory', function($http, $interpolate) {
	var refData = {};

	function checkDigit(str) {
		var check = 0;
		if (str) {
			for (var i = 0; i < str.length; i++) {
				var code = str.charCodeAt(i)
				if (code >= 48 && code <= 57) {
					code -= 48; // numbers
				} else if (code >= 65 && code <= 90) {
					code -= 55; // letters
				} else {
					code = 0;
				}
				var weight = 1;
				if (i % 3 == 0) {
					weight = 7;
				} else if (i % 3 == 1) {
					weight = 3;
				}
				check += code * weight;
			}
		}
		return check % 10;
	}

	function padString(str, len, textOnly) {
		str = (str || '').toUpperCase() //

		// http://www.icao.int/publications/Documents/9303_p3_cons_en.pdf
		.replace(/\u00C0|\u00C1|\u00C2|\u00C3|\u0100|\u0102|\u0104/g, 'A') //
		.replace(/\u00C5/g, 'AA') //
		.replace(/\u00C4|\u00C6/g, 'AE') //
		.replace(/\u00C7|\u0106|\u0108|\u010A|\u010C/g, 'C') //
		.replace(/\u010E|\u0110|\u00D0/g, 'D') //
		.replace(/\u00C8|\u00C9|\u00CA|\u00CB|\u0112|\u0114|\u0116|\u0118|\u011A/g, 'E') //
		.replace(/\u011C|\u011E|\u0120|\u0122/g, 'G') //
		.replace(/\u0124|\u0126/g, 'H') //
		.replace(/\u00CC|\u00CD|\u00CE|\u00CF|\u0128|\u012A|\u012C|\u012E|\u0130/g, 'I') //
		.replace(/\u0132/g, 'IJ') //
		.replace(/\u0134/g, 'J') //
		.replace(/\u0136/g, 'K') //
		.replace(/\u0139|\u013B|\u013D|\u013F|\u0141/g, 'L') //
		.replace(/\u00D1|\u0143|\u0145|\u0147|\u014B/g, 'N') //
		.replace(/\u00D2|\u00D3|\u00D4|\u00D5|\u014C|\u014E|\u0150/g, 'O') //
		.replace(/\u00D6|\u00D8|\u0152/g, 'OE') //
		.replace(/\u0154|\u0156|\u0158/g, 'R') //
		.replace(/\u015A|\u015C|\u015E|\u0160/g, 'S') //
		.replace(/\u00DF/g, 'SS') //
		.replace(/\u0162|\u0164|\u0166/g, 'T') //
		.replace(/\u00FE|\u00DE/g, 'TH') //
		.replace(/\u00D9|\u00DA|\u00DB|\u0168|\u016A|\u016C|\u016E|\u0170|\u0172/g, 'U') //
		.replace(/\u00DC/g, 'UE') //
		.replace(/\u0174/g, 'W') //
		.replace(/\u00DD|\u0176|\u0178/g, 'Y') //
		.replace(/\u0179|\u017B|\u017D/g, 'Z') //

		// Remove punctiation except hyphen
		.replace(/[ \\-]+/g, '<').replace(/[^A-Z0-9<]+/g, '');

		if (str.length > len) {
			str = str.substring(0, len);
		} else {
			str += '<'.repeat(len - str.length);
		}

		if (!textOnly) {
			// HTML-encode the <
			str = str.replace(/</g, '&lt;')
		}
		return str;
	}

	return {
		buildbarcodeFields : function buildbarcodeFields(form) {
			// Use template to build MRZ string
			// Default to ICAO 2-line 44-character format
			var template = form.docType.template || TEMPLATE_MRZ2;
			var docNumberLength = form.docType.docNumberLength || 9;
			var extraNumberLength = form.docType.extraNumberLength || 0;
			var optNumberLength = form.docType.optNumberLength || 14;
			var nameLength = form.docType.nameLength || 39;

			var name = (form.lastName || '') + '<<' + (form.firstName || '');
			var birthDate = moment(form.birthDate || null);
			var expireDate = moment(form.expireDate || null);

			// Compute MRZ fields
			var barcodeFields = {
				docType : padString(form.docType.code, 2),
				docNumber : padString(form.docNumber, docNumberLength),
				birthDate : padString(birthDate.isValid() ? birthDate.format('YYMMDD') : '', 6),
				issueCountry : padString(form.issueCountry, 3),
				nationality : padString(form.nationality, 3),
				sex : padString(form.sex, 1),
				expireDate : padString(expireDate.isValid() ? expireDate.format('YYMMDD') : '', 6),
				subType : padString(form.docSubType, 2),
				name : padString(name, nameLength),
				optNumber : padString(form.optNumber, optNumberLength),
				extraNumber : padString(form.extraNumber, extraNumberLength)
			};

			// Compute MRZ check digits
			var forceCheck = form.docType.forceCheck || {};
			barcodeFields.check = {
				docNumber : forceCheck.docNumber || checkDigit(barcodeFields.docNumber),
				optNumber : forceCheck.optNumber || checkDigit(barcodeFields.optNumber),
				birthDate : checkDigit(barcodeFields.birthDate),
				expireDate : checkDigit(barcodeFields.expireDate),
				// only for A1/A2 card
				extraNumber : checkDigit(barcodeFields.extraNumber)
			};
			barcodeFields.check.overall2 = checkDigit(barcodeFields.docNumber + barcodeFields.check.docNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.optNumber + barcodeFields.check.optNumber);
			barcodeFields.check.overall3 = checkDigit(barcodeFields.docNumber + barcodeFields.check.docNumber + barcodeFields.optNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.extraNumber);

			// If this document type has special check digit rules, run them
			// also
			if (form.docType.calculateSpecialCheck) {
				form.docType.calculateSpecialCheck(barcodeFields);
			}

			// Build MRZ using template
			console.log('MRZ Fields', barcodeFields);
			return barcodeFields;
		},

		buildMrz : function buildMrz(template, barcodeFields, textOnly) {
			var mrz = $interpolate(template || TEMPLATE_MRZ2)(barcodeFields);
			console.log('mrz', mrz);
			if (textOnly) {
				var div = document.createElement('DIV');
				div.innerHTML = mrz.replace(/<br>/g, '\n');
				mrz = div.textContent || div.innerText;
			}
			return mrz;
		},

		checkDigit : checkDigit,

		padString : padString,

		getRefData : function getRefData() {
			return $http.get('mrz.json').then(function(success) {
				refData = success.data;

				/**
				 * Document type list. Optional properties if the document
				 * format differs from ICAO 2-line 44-character standard:
				 * <ul>
				 * <li>optNumberLabel (default: 'Optional no.')</li>
				 * <li>docNumberLength (default: 9)</li>
				 * <li>optNumberLength (default: 14)</li>
				 * <li>nameLength (default: 39)</li>
				 * <li>template (default: TEMPLATE_MRZ2)</li>
				 * </ul>
				 */
				refData.docTypes = [ {
					code : 'P',
					name : 'Passport'
				}, {
					code : 'PR',
					name : 'Re-entry Permit',
					optNumberLabel : 'Petition no.'
				}, {
					code : 'TR',
					name : 'Re-entry Permit 2010',
					optNumberLabel : 'Petition no.'
				}, {
					code : 'PT',
					name : 'Refugee Travel Document',
					optNumberLabel : 'Petition no.'
				}, {
					code : 'TP',
					name : 'Refugee Travel Document 2010',
					optNumberLabel : 'Petition no.'
				}, {
					code : 'VN',
					name : 'Visa Non-Immigrant',
					optNumberLabel : 'Visa no.',
					optNumberLength : 14,
					subTypes : refData.visaClasses,
					template : TEMPLATE_VISA
				}, {
					code : 'VI',
					name : 'Visa Immigrant',
					optNumberLabel : 'Visa no.',
					optNumberLength : 14,
					subTypes : refData.visaClasses,
					template : TEMPLATE_VISA
				}, {
					code : 'VB',
					name : 'Laser Visa/Border Crossing Card',
					docNumberLength : 14,
					extraNumberLength : 11,
					optNumberLength : 10,
					nameLength : 30,
					template : TEMPLATE_BCC,
					calculateSpecialCheck : function(barcodeFields) {
						barcodeFields.check.overall3 = checkDigit(barcodeFields.optNumber + '<' + barcodeFields.docNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.extraNumber);
					}
				}, {
					code : 'IP',
					name : 'Passport Card',
					extraNumberLength : 11,
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				}, {
					code : 'IF',
					name : 'Fast Card',
					extraNumberLength : 11,
					optNumberLabel : 'PASS ID',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				}, {
					code : 'ID',
					name : 'Enhanced Driver License',
					subTypes : refData.states,
					extraNumberLength : 8,
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_ID,
					calculateSpecialCheck : function(barcodeFields) {
						barcodeFields.check.overall3 = checkDigit(barcodeFields.docNumber + barcodeFields.check.docNumber + barcodeFields.optNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.extraNumber + barcodeFields.subType + '<');
					}
				}, {
					code : 'IG',
					name : 'Global Entry Card',
					extraNumberLength : 11,
					optNumberLabel : 'PASS ID',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				}, {
					code : 'IN',
					name : 'Nexus Card',
					extraNumberLength : 11,
					optNumberLabel : 'PASS ID',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				}, {
					code : 'IS',
					name : 'Sentri Card',
					extraNumberLength : 11,
					optNumberLabel : 'PASS ID',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				}, {
					code : 'C1',
					name : 'Permanent Resident Card',
					extraNumberLength : 11,
					optNumberLabel : 'Petition no.',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3,
					forceCheck : {
						docNumber : '<'
					}
				}, {
					code : 'C2',
					name : 'Permanent Resident Card',
					extraNumberLength : 11,
					optNumberLabel : 'Petition no.',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3,
					forceCheck : {
						docNumber : '<'
					}
				}, {
					code : 'A1',
					name : 'Alien Registration Card 1998',
					extraNumberLength : 13,
					hideNationality : true,
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_ALIEN,
					forceCheck : {
						docNumber : '<'
					},
					calculateSpecialCheck : function(barcodeFields) {
						barcodeFields.check.overall3 = checkDigit(barcodeFields.docNumber + barcodeFields.check.docNumber + barcodeFields.optNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.extraNumber + barcodeFields.check.extraNumber);
					}
				}, {
					code : 'A2',
					name : 'Alien Registration Card 1998',
					extraNumberLength : 13,
					hideNationality : true,
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_ALIEN,
					forceCheck : {
						docNumber : '<'
					},
					calculateSpecialCheck : function(barcodeFields) {
						barcodeFields.check.overall3 = checkDigit(barcodeFields.docNumber + barcodeFields.check.docNumber + barcodeFields.optNumber + barcodeFields.birthDate + barcodeFields.check.birthDate + barcodeFields.expireDate + barcodeFields.check.expireDate + barcodeFields.extraNumber + barcodeFields.check.extraNumber);
					}
				}, {
					code : 'IA',
					name : 'Employment Authorization Card',
					extraNumberLength : 11,
					optNumberLabel : 'Petition no.',
					optNumberLength : 15,
					nameLength : 30,
					template : TEMPLATE_MRZ3
				} ];

				return refData;
			});
		},

		getRandomId : function randomId() {
			var id = refData.ids[Math.floor(Math.random() * refData.ids.length)];
			return {
				docNumber : String.fromCharCode(getRandomInt(65, 90)) + getRandomInt(10000, 9999999),
				lastName : id.lastName || '',
				firstName : id.firstName || '',
				issueCountry : id.country || '',
				nationality : id.country || '',
				birthDate : +moment([ getRandomInt(1918, 2014), getRandomInt(1, 12), getRandomInt(1, 30) ]).tz('America/New_York'),
				sex : getRandomInt(0, 1) == 0 ? 'M' : 'F'
			};
		}
	};
});
