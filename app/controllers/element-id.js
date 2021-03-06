/**
 * @overview Controllers that handle element detail actions, as well as custom icon actions.
 * @author Martin Vach
 */


/**
 * The controller that handles element detail actions.
 * @class ElementIdController
 */
myAppController.controller('ElementIdController', function($scope, $q, $routeParams, $filter, $location, $timeout, cfg, dataFactory, dataService, myCache) {
	$scope.elementId = {
		show: false,
		appType: {},
		input: {},
		locations: {},
		instances: {},
		modules: {}
	};
	$scope.tagList = [];
	$scope.search = {
		text: ''
	};
	$scope.suggestions = [];

	$scope.speechAssistants = {
		Alexa: {
			active: false,
			instance: {}
		},
		GoogleHome: {
			active: false,
			instance: {}
		}
	};

	/**
	 * Load all promises
	 */
	$scope.allSettled = function() {
		$scope.loading = {
			status: 'loading-spin',
			icon: 'fa-spinner fa-spin',
			message: $scope._t('loading')
		};
		var promises = [
			dataFactory.getApi('devices', '/' + $routeParams.id, true),
			dataFactory.getApi('locations'),
			dataFactory.getApi('devices')
		];

		if ($scope.user.role === 1) {
			promises.push(dataFactory.getApi('modules', false, true));
			promises.push(dataFactory.getApi('instances', false, true));
		}

		$q.allSettled(promises).then(function(response) {
			var device = response[0];
			var locations = response[1];
			var devices = response[2];
			var modules = response[3];
			var instances = response[4];


			$scope.loading = false;
			// Error message
			if (device.state === 'rejected') {
				angular.extend(cfg.route.alert, {
					message: $scope._t('error_load_data')
				});
				return;
			}
			// Success - locations
			if (locations.state === 'fulfilled') {
				$scope.elementId.locations = dataService.getRooms(locations.value.data.data).indexBy('id').value();
			}
			// Success - devices
			if (devices.state === 'fulfilled') {
				setTagList(devices.value.data.data.devices);
			}
			// Success - instances
			if (instances && instances.state === 'fulfilled') {
				$scope.elementId.instances = instances.value.data.data;
				setSpeechAssitants(instances.value.data.data);
			}

			// Success - modules
			if (modules && modules.state === 'fulfilled') {
				$scope.elementId.modules = modules.value.data.data;
			}
			// Success - device
			if (device.state === 'fulfilled') {
				var arr = [];
				arr[0] = device.value.data.data;
				if (!dataService.getDevicesData(arr, true).value()[0]) {
					angular.extend(cfg.route.alert, {
						message: $scope._t('error_load_data')
					});
					return;
				}
				setDevice(dataService.getDevicesData(arr, true).value()[0]);
				$scope.elementId.show = true;
			}


		});
	};
	$scope.allSettled();

	/**
	 * Search me
	 */
	$scope.searchMe = function() {
		$scope.suggestions = [];
		if ($scope.search.text.length >= 2) {
			findText($scope.tagList, $scope.search.text, $scope.elementId.input.tags);
		}
	};

	/**
	 * Add tag to list
	 */
	$scope.addTag = function(tag) {
		tag = tag || $scope.search.text;
		$scope.suggestions = [];
		if (!tag || $scope.elementId.input.tags.indexOf(tag) > -1) {
			return;
		}
		$scope.elementId.input.tags.push(tag);
		$scope.search.text = '';
		return;
	};
	/**
	 * Remove tag from list
	 */
	$scope.removeTag = function(index) {
		$scope.elementId.input.tags.splice(index, 1);
		$scope.suggestions = [];
	};
	/**
	 * Update an item
	 */
	$scope.store = function(input) {
		if (input.id) {
			$scope.loading = {
				status: 'loading-spin',
				icon: 'fa-spinner fa-spin',
				message: $scope._t('updating')
			};
			var data = {
				id: input.id,
				location: parseInt(input.location, 10),
				tags: input.tags,
				metrics: input.metrics,
				visibility: input.visibility,
				permanently_hidden: input.permanently_hidden
			};
			dataFactory.putApi('devices', input.id, data).then(function(response) {
				$scope.user.dashboard = dataService.setArrayValue($scope.user.dashboard, input.id, input.onDashboard);
				$scope.user.hide_single_device_events = dataService.setArrayValue($scope.user.hide_single_device_events, input.id, input.hide_events);
				$scope.updateProfile($scope.user, input.id);
				$scope.updateAlexaInstance($scope.speechAssistants.Alexa.instance, input);
				$scope.updateGoogleHomeInstance($scope.speechAssistants.GoogleHome.instance, input);
			}, function(error) {
				alertify.alertError($scope._t('error_update_data'));
				$scope.loading = false;
			});
		}

	};
	/**
	 * Update profile
	 */
	$scope.updateProfile = function(profileData, deviceId) {
		dataFactory.putApi('profiles', profileData.id, profileData).then(function(response) {
			$scope.loading = false;
			angular.extend($scope.user, response.data.data);
			angular.extend(cfg.user, response.data.data);
			//dataService.setUser(response.data.data);
			myCache.remove('devices');
			myCache.remove('devices/' + deviceId);
			myCache.remove('locations');
			dataService.goBack();

		}, function(error) {
			alertify.alertError($scope._t('error_update_data'));
			$scope.loading = false;
		});
		return;
	};

	/**
	 * Update Alexa instance
	 */
	$scope.updateAlexaInstance = function(instance, device) {
		if (!_.isEmpty(instance)) {
			var action = false,
				alexaDevIndex = instance.params.devices.findIndex(function(dev) {
					return dev.id == device.id
				});

			if (device.alexaActivated && alexaDevIndex !== -1) {
				if (instance.params.devices[alexaDevIndex].callName !== device.callName) { // update
					instance.params.devices[alexaDevIndex].callName = device.callName;
					action = true;
				}
			} else if (!device.alexaActivated && alexaDevIndex !== -1) { // delete
				instance.params.devices.splice(alexaDevIndex, 1);
				action = true;
			} else if (device.alexaActivated && alexaDevIndex == -1) { // add
				var obj = {
					"id": device.id,
					"name": device.metrics.title,
					"callName": device.callName
				}
				instance.params.devices.push(obj);
				action = true;
			}

			if (action) {
				dataFactory.storeApi('instances', parseInt(instance.id, 10), instance).then(function(response) {
					$scope.loading = false
					dataService.showNotifier({
						message: $scope._t('success_updated')
					});
				}, function(error) {
					$scope.loading = false
					alertify.alertError($scope._t('error_update_data'));
				});
			} else {
				dataService.showNotifier({
					message: $scope._t('success_updated')
				});
			}
		}
	}

	/**
	 * Update Google Home instance
	 */
	$scope.updateGoogleHomeInstance = function(instance, device) {
		if (!_.isEmpty(instance)) {
			var action = false,
				googleHomeDevIndex = instance.params.devices.findIndex(function(dev) {
					return dev.id == device.id
				});

			if (device.googleHomeActivated && googleHomeDevIndex !== -1) {
				if (instance.params.devices[googleHomeDevIndex].callName !== device.callName) { // update
					instance.params.devices[googleHomeDevIndex].callName = device.callName;
					action = true;
				}
			} else if (!device.googleHomeActivated && googleHomeDevIndex !== -1) { // delete
				instance.params.devices.splice(googleHomeDevIndex, 1);
				action = true;
			} else if (device.googleHomeActivated && googleHomeDevIndex == -1) { // add
				var obj = {
					"id": device.id,
					"name": device.metrics.title,
					"callName": device.callName
				}
				instance.params.devices.push(obj);
				action = true;
			}

			if (action) {
				dataFactory.storeApi('instances', parseInt(instance.id, 10), instance).then(function(response) {
					$scope.loading = false
					dataService.showNotifier({
						message: $scope._t('success_updated')
					});
				}, function(error) {
					$scope.loading = false
					alertify.alertError($scope._t('error_update_data'));
				});
			} else {
				dataService.showNotifier({
					message: $scope._t('success_updated')
				});
			}
		}
	}

	/**
	 * Delete an element from the view
	 */
	$scope.deleteElement = function(input, message) {
		alertify.confirm(message, function() {
			$scope.loading = {
				status: 'loading-spin',
				icon: 'fa-spinner fa-spin',
				message: $scope._t('deleting')
			};
			var data = {
				id: input.id,
				permanently_hidden: true
			};
			dataFactory.putApi('devices', input.id, data).then(function(response) {
				$scope.loading = {
					status: 'loading-spin',
					icon: 'fa-spinner fa-spin',
					message: $scope._t('reloading_page')
				};
				$timeout(function() {
					$scope.loading = false;
					myCache.removeAll();
					$location.path('/elements');
				}, 2000);
			}, function(error) {
				alertify.alertError($scope._t('error_delete_data'));
				$scope.loading = false;
			});
		}).setting('labels', {
			'ok': $scope._t('ok')
		});
	};

	/// --- Private functions --- ///
	/**
	 * Set device
	 */
	function setDevice(device) {
		var findZwaveStr = "ZWayVDev_zway_";
		var findZenoStr = "ZEnoVDev_zeno_x";
		var zwaveId = false;
		$scope.elementId.input = device;

		if ($scope.user.role === 1) {
			var instance = _.findWhere($scope.elementId.instances, {
				id: $filter('toInt')(device.creatorId)
			});

			var modul = _.findWhere($scope.elementId.modules, {
				moduleName: instance? instance.moduleId : null
			});

			$scope.elementId.appType['instance'] = instance || null;
			$scope.elementId.appType['modul'] = modul || null;

			if (device.id.indexOf(findZwaveStr) > -1) {
				zwaveId = device.id.split(findZwaveStr)[1].split('-')[0];
				$scope.elementId.appType['zwave'] = zwaveId.replace(/[^0-9]/g, '');
			} else if (device.id.indexOf(findZenoStr) > -1) {
				$scope.elementId.appType['enocean'] = device.id.split(findZenoStr)[1].split('_')[0];
			}
		}

		if (cfg.route.os == 'PoppApp_Z_Way') {
			if (($scope.elementId.input.deviceType == 'toggleButton' &&
					$scope.elementId.input.probeType !== 'notification_push' &&
					$scope.elementId.input.probeType !== 'notification_email') ||
				$scope.elementId.input.deviceType == 'switchBinary') {
				if ($scope.elementId.input.metrics.level == "on") {
					var device_on = angular.copy($scope.elementId.input);

					var device_off = angular.copy($scope.elementId.input);
					device_off.metrics.level = "off";
				} else if ($scope.elementId.input.metrics.level == "off") {
					var device_off = angular.copy($scope.elementId.input);

					var device_on = angular.copy($scope.elementId.input);
					device_on.metrics.level = "on";
				}

				offIconPath = dataService.assignElementIcon(device_off);
				onIconPath = dataService.assignElementIcon(device_on);

				var offData = {
					"id": $scope.elementId.input.id,
					"name": $filter('stringToSlug')($scope.elementId.input.metrics.title),
					"device_type": $scope.elementId.input.deviceType,
					"icon": $scope.elementId.input.metrics.icon,
					"iconPath": offIconPath,
					"state": "off"
				};

				var onData = {
					"id": $scope.elementId.input.id,
					"name": $filter('stringToSlug')($scope.elementId.input.metrics.title),
					"device_type": $scope.elementId.input.deviceType,
					"icon": $scope.elementId.input.metrics.icon,
					"iconPath": onIconPath,
					"state": "on"
				};

				onParams = Object.keys(onData).map(function(key) {
					return key + '=' + onData[key];
				}).join('&');

				offParams = Object.keys(offData).map(function(key) {
					return key + '=' + offData[key];
				}).join('&');

				var addOffUrl = "/AndoridWidget?" + offParams;
				var addOnUrl = "/AndoridWidget?" + onParams;

				angular.extend($scope.elementId.input, {
					addOffUrl: addOffUrl
				}, {
					addOnUrl: addOnUrl
				});
			}
		}

		angular.extend($scope.elementId.input, {
			iconPath: dataService.assignElementIcon($scope.elementId.input)
		}, );

		setAlexa($scope.speechAssistants.Alexa.instance, $scope.elementId.input);
		setGoogleHome($scope.speechAssistants.GoogleHome.instance, $scope.elementId.input);
	};

	function setAlexa(instance, device) {
		// Alexa
		var isWhitelisted = false,
			wlDev = _.find(cfg.speechAssistants.Alexa.deviceTypeWhitelist, function(needle) {
				if (Object.keys(needle) == device.deviceType) {
					return needle;
				}
			});

		if (typeof wlDev !== 'undefined') {
			if (wlDev[Object.keys(wlDev)].length > 0) {
				if (wlDev[Object.keys(wlDev)].indexOf(device.probeType) > -1) {
					isWhitelisted = true;
				}
			} else {
				isWhitelisted = true;
			}
		}

		if (instance.active && isWhitelisted) {
			if (instance.params.devices) {
				var pos = instance.params.devices.findIndex(function(dev) {
						return dev.id == device.id
					}),
					callName = device.metrics.title,
					alexaActivated = false;

				if (pos != -1) {
					callName = instance.params.devices[pos].callName;
					alexaActivated = true;
				}
				console.log($scope.elementId.input.callName);
				if ($scope.elementId.input.callName && $scope.elementId.input.callName !== "") {
					angular.extend($scope.elementId.input, {
						alexaActivated: alexaActivated,
						alexaWhitelisted: isWhitelisted
					});
				} else {
					angular.extend($scope.elementId.input, {
						callName: callName,
						alexaActivated: alexaActivated,
						alexaWhitelisted: isWhitelisted
					});
				}
			}
		}
	}

	function setGoogleHome(instance, device) {
		// Alexa
		var isWhitelisted = false,
			wlDev = _.find(cfg.speechAssistants.GoogleHome.deviceTypeWhitelist, function(needle) {
				if (Object.keys(needle) == device.deviceType) {
					return needle;
				}
			});

		if (typeof wlDev !== 'undefined') {
			if (wlDev[Object.keys(wlDev)].length > 0) {
				if (wlDev[Object.keys(wlDev)].indexOf(device.probeType) > -1) {
					isWhitelisted = true;
				}
			} else {
				isWhitelisted = true;
			}
		}

		if (instance.active && isWhitelisted) {
			if (instance.params.devices) {
				var pos = instance.params.devices.findIndex(function(dev) {
						return dev.id == device.id
					}),
					callName = device.metrics.title,
					googleHomeActivated = false;

				if (pos != -1) {
					callName = instance.params.devices[pos].callName;
					googleHomeActivated = true;
				}
				if ($scope.elementId.input.callName && $scope.elementId.input.callName !== "") {
					angular.extend($scope.elementId.input, {
						googleHomeActivated: googleHomeActivated,
						googleHomeWhitelisted: isWhitelisted
					});
				} else {
					angular.extend($scope.elementId.input, {
						callName: callName,
						googleHomeActivated: googleHomeActivated,
						googleHomeWhitelisted: isWhitelisted
					});
				}
			}
		}
	}

	function setSpeechAssitants(instances) {
		var Alexa_instance = _.findWhere(instances, {
			moduleId: 'Alexa'
		});
		if (Alexa_instance) {
			if (Alexa_instance.active) {
				$scope.speechAssistants.Alexa.active = true;
			}
			$scope.speechAssistants.Alexa.instance = Alexa_instance
		}

		var GoogleHome_instance = _.findWhere(instances, {
			moduleId: 'GoogleHome'
		});
		if (GoogleHome_instance) {
			if (GoogleHome_instance.active) {
				$scope.speechAssistants.GoogleHome.active = true;
			}
			$scope.speechAssistants.GoogleHome.instance = GoogleHome_instance;
		}
	}

	/**
	 * Set tag list
	 */
	function setTagList(devices) {
		angular.forEach(devices, function(v, k) {
			if (v.tags) {
				angular.forEach(v.tags, function(t, kt) {
					if ($scope.tagList.indexOf(t) === -1) {
						$scope.tagList.push(t);
					}

				});
			}
		});
	};

	/**
	 * Find text
	 */
	function findText(n, search, exclude) {
		var gotText = false;
		for (var i in n) {
			var re = new RegExp(search, "ig");
			var s = re.test(n[i]);
			if (s &&
				(!_.isArray(exclude) || exclude.indexOf(n[i]) === -1)) {
				$scope.suggestions.push(n[i]);
				gotText = true;
			}
		}
		return gotText;
	};

});

/**
 * The controller that handles custom icon actions in the elemt detail view.
 * @class ElementIconController
 */
myAppController.controller('ElementIconController', function($scope, $timeout, $filter, cfg, dataFactory, dataService) {
	$scope.icons = {
		selected: false,
		uploadedFileName: false,
		all: {},
		uploaded: {},
		info: {
			maxSize: $filter('fileSizeString')(cfg.upload.icon.size),
			extensions: cfg.upload.icon.extension.toString()
		}
	};
	/**
	 * Load icons from config
	 * @returns {undefined}
	 */
	$scope.loadCfgIcons = function() {
		$scope.icons.all = dataService.getSingleElementIcons($scope.elementId.input);

	};
	$scope.loadCfgIcons();

	/**
	 * Load already uploaded icons
	 * @returns {undefined}
	 */
	$scope.loadUploadedIcons = function() {
		// Atempt to load data
		dataFactory.getApi('icons', null, true).then(function(response) {
			$scope.icons.uploaded = response.data.data;
		}, function(error) {
			angular.extend(cfg.route.alert, {
				message: $scope._t('error_load_data')
			});
			$scope.loading = false;
		});

	};
	$scope.loadUploadedIcons();
	/**
	 * Set selected icon
	 * @param {string} icon
	 * @returns {undefined}
	 */
	$scope.setSelectedIcon = function(icon) {
		if (!icon) {
			return;
		}
		$scope.icons.selected = icon;
	};
	/**
	 * Set a custom icon with an icon from the list
	 * @param {string} icon
	 * @returns {undefined}
	 */
	$scope.setCustomIcon = function(icon) {
		if (!icon) {
			return;
		}
		$scope.icons.all.custom[$scope.icons.selected] = icon;

	};
	/**
	 * Remove a custom icon
	 * @param {string} icon
	 * @returns {undefined}
	 */
	$scope.removeCustomIcon = function(icon) {
		if (!icon) {
			return;
		}
		delete $scope.icons.all.custom[icon];

	};

	/**
	 * Update custom icons with selected icons from the list
	 * @returns {undefined}
	 */
	$scope.updateWithCustomIcon = function() {
		var customicons = function(icons, custom) {
			var obj = {};
			if (_.isEmpty(custom)) {
				return obj;
			} else if (icons['default']) {
				return custom;
			} else {
				obj['level'] = custom;
				return obj;
			}
		}
		var input = {
			customicons: customicons($scope.icons.all.default, $scope.icons.all.custom)
		};
		var id = $scope.elementId.input.id;
		$scope.loading = {
			status: 'loading-spin',
			icon: 'fa-spinner fa-spin',
			message: $scope._t('updating')
		};
		dataFactory.putApi('customicon', id, input, '?icon').then(function(response) {
			$scope.icons.selected = false;
			$scope.loading = false;
			dataService.showNotifier({
				message: $scope._t('success_updated')
			});
		}, function(error) {
			$scope.loading = false;
			alertify.alertError($scope._t('error_update_data'));
		});
	};
	/**
	 * Cancel all updates and hide a list with uploaded icons
	 * @returns {undefined}
	 */
	$scope.cancelUpdate = function() {
		// Reset icons
		$scope.loadCfgIcons();
		// Set selected icon to false
		$scope.icons.selected = false;
	};

});