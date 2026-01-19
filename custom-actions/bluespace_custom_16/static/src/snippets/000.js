/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import publicWidget from "@web/legacy/js/public/public_widget";
import { rpc } from "@web/core/network/rpc";

console.log("Bluespace s_website_form override module loaded");

// Wait for DOM and registry to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM ready, checking for s_website_form widget...");
    
    // Function to apply the override
    function applyFormOverride() {
        if (!publicWidget.registry.s_website_form) {
            console.error("✗ s_website_form widget not found in registry");
            console.log("Available widgets:", Object.keys(publicWidget.registry));
            return false;
        }
        
        console.log("✓ s_website_form widget found, applying override");
        
        publicWidget.registry.s_website_form.include({
            /**
             * @override
             * Complete form submission handler with all features
             */
            send: async function (e) {
                e.preventDefault();
                
                console.log("Custom send() method called");

                // Prevent users from crazy clicking
                const $button = this.$target.find('.s_website_form_send, .o_website_form_send');
                $button.addClass('disabled').attr('disabled', 'disabled');

                // Add loading effect to button
                const buttonEl = $button[0];
                if (buttonEl) {
                    buttonEl.classList.add('o_loading');
                }

                const self = this;

                // Clear previous results
                self.$target.find('#s_website_form_result, #o_website_form_result').empty();

                // Validate form fields
                if (!self.check_error_fields({})) {
                    self.update_status('error', _t("Please fill in the form correctly."));
                    $button.removeClass('disabled').removeAttr('disabled');
                    if (buttonEl) buttonEl.classList.remove('o_loading');
                    return false;
                }

                // Prepare form inputs
                this.form_fields = this.$target.serializeArray();
                
                // Handle file inputs - aggregate multiple files
                $.each(this.$target.find('input[type=file]:not([disabled])'), (outer_index, input) => {
                    $.each($(input).prop('files'), function (index, file) {
                        self.form_fields.push({
                            name: input.name + '[' + outer_index + '][' + index + ']',
                            value: file
                        });
                    });
                });

                // Serialize form inputs into a single object
                var form_values = {};
                _.each(this.form_fields, function (input) {
                    if (input.name in form_values) {
                        if (Array.isArray(form_values[input.name])) {
                            form_values[input.name].push(input.value);
                        } else {
                            form_values[input.name] = [form_values[input.name], input.value];
                        }
                    } else {
                        if (input.value !== '') {
                            form_values[input.name] = input.value;
                        }
                    }
                });

                // Force server date format usage for existing fields
                this.$target.find('.s_website_form_field:not(.s_website_form_custom)')
                    .find('.s_website_form_date, .s_website_form_datetime').each(function () {
                        const inputEl = this.querySelector('input');

                        if (!inputEl || !inputEl.value) {
                            return;
                        }

                        try {
                            const dateValue = new Date(inputEl.value);
                            
                            if (!isNaN(dateValue.getTime())) {
                                let formattedDate;
                                
                                if ($(this).hasClass('s_website_form_datetime')) {
                                    // Format as UTC datetime: YYYY-MM-DD HH:mm:ss
                                    const year = dateValue.getUTCFullYear();
                                    const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
                                    const day = String(dateValue.getUTCDate()).padStart(2, '0');
                                    const hours = String(dateValue.getUTCHours()).padStart(2, '0');
                                    const minutes = String(dateValue.getUTCMinutes()).padStart(2, '0');
                                    const seconds = String(dateValue.getUTCSeconds()).padStart(2, '0');
                                    formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                                } else {
                                    // Format as date only: YYYY-MM-DD
                                    const year = dateValue.getFullYear();
                                    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
                                    const day = String(dateValue.getDate()).padStart(2, '0');
                                    formattedDate = `${year}-${month}-${day}`;
                                }
                                
                                form_values[inputEl.getAttribute('name')] = formattedDate;
                                console.log("Formatted date field:", inputEl.getAttribute('name'), "=", formattedDate);
                            }
                        } catch (err) {
                            console.warn("Date parsing error:", err);
                        }
                    });

                // Handle reCAPTCHA if loaded
                if (this._recaptchaLoaded) {
                    const tokenObj = await this._recaptcha.getToken('website_form');
                    if (tokenObj.token) {
                        form_values['recaptcha_token_response'] = tokenObj.token;
                        console.log("reCAPTCHA token added");
                    } else if (tokenObj.error) {
                        self.update_status('error', tokenObj.error);
                        $button.removeClass('disabled').removeAttr('disabled');
                        if (buttonEl) buttonEl.classList.remove('o_loading');
                        return false;
                    }
                }

                console.log("Final form values:", form_values);

                // Post form and handle result
                const action = this.$target.attr('action') + (this.$target.data('force_action') || this.$target.data('model_name'));
                
                try {
                    console.log("Submitting to:", action);
                    
                    const result_data = await rpc(action, form_values);
                    
                    console.log("Form submission result:", result_data);

                    // Restore send button behavior
                    $button.removeClass('disabled').removeAttr('disabled');
                    if (buttonEl) buttonEl.classList.remove('o_loading');

                    if (!result_data.id) {
                        // Failure
                        self.update_status('error', result_data.error ? result_data.error : false);
                        if (result_data.error_fields) {
                            self.check_error_fields(result_data.error_fields);
                        }
                    } else {
                        // Success
                        let successMode = self.$target[0].dataset.successMode;
                        let successPage = self.$target[0].dataset.successPage;
                        
                        if (!successMode) {
                            successPage = self.$target.attr('data-success_page');
                            successMode = successPage ? 'redirect' : 'nothing';
                        }

                        // CUSTOM: Check for thanks page redirect
                        if (result_data.is_thanks_page) {
                            console.log("CUSTOM REDIRECT: Going to /shop/order/thanks");
                            window.location.href = '/shop/order/thanks';
                            return;
                        }

                        switch (successMode) {
                            case 'redirect': {
                                let hashIndex = successPage.indexOf("#");
                                if (hashIndex > 0) {
                                    let currentUrlPath = window.location.pathname;
                                    if (!currentUrlPath.endsWith("/")) {
                                        currentUrlPath = currentUrlPath + "/";
                                    }
                                    if (!successPage.includes("/#")) {
                                        successPage = successPage.replace("#", "/#");
                                        hashIndex++;
                                    }
                                    
                                    const langCode = document.documentElement.lang || 'en';
                                    
                                    if ([successPage, "/" + langCode + successPage].some(link => link.startsWith(currentUrlPath + '#'))) {
                                        successPage = successPage.substring(hashIndex);
                                    }
                                }
                                
                                if (successPage.charAt(0) === "#") {
                                    const successAnchorEl = document.getElementById(successPage.substring(1));
                                    if (successAnchorEl) {
                                        successAnchorEl.scrollIntoView({
                                            behavior: 'smooth',
                                            block: 'start',
                                        });
                                    }
                                    break;
                                }
                                
                                console.log("Redirecting to:", successPage);
                                window.location.href = successPage;
                                return;
                            }
                            
                            case 'message': {
                                await new Promise(resolve => setTimeout(resolve, 300));

                                self.$target[0].classList.add('d-none');
                                const endMessage = self.$target[0].parentElement?.querySelector('.s_website_form_end_message');
                                if (endMessage) {
                                    endMessage.classList.remove('d-none');
                                }
                                break;
                            }
                            
                            default: {
                                await new Promise(resolve => setTimeout(resolve, 300));
                                self.update_status('success');
                                break;
                            }
                        }

                        self.$target[0].reset();
                    }
                } catch (error) {
                    console.error("Form submission error:", error);
                    
                    $button.removeClass('disabled').removeAttr('disabled');
                    if (buttonEl) buttonEl.classList.remove('o_loading');
                    
                    const errorMsg = error.status && error.status === 413 
                        ? _t("Uploaded file is too large.") 
                        : _t("An error occurred. Please try again.");
                    
                    self.update_status('error', errorMsg);
                }
            },
        });
        
        console.log("✓ Form override applied successfully");
        return true;
    }
    
    // Try to apply immediately
    if (!applyFormOverride()) {
        // If failed, retry after a delay
        console.log("Retrying in 500ms...");
        setTimeout(function() {
            if (!applyFormOverride()) {
                console.log("Retrying in 1000ms...");
                setTimeout(applyFormOverride, 1000);
            }
        }, 500);
    }
});

// import { _t } from "@web/core/l10n/translation";
// import publicWidget from "@web/legacy/js/public/public_widget";
// import { rpc } from "@web/core/network/rpc";

// // Wait for DOM and other widgets to be ready
// $(document).ready(function () {
//     console.log("Checking for s_website_form widget...");
    
//     // Check if widget exists before including
//     if (!publicWidget.registry.s_website_form) {
//         console.warn("s_website_form widget not found, will retry...");
        
//         // Retry after a short delay
//         setTimeout(function() {
//             if (!publicWidget.registry.s_website_form) {
//                 console.error("s_website_form widget still not found!");
//                 return;
//             }
//             applyFormOverride();
//         }, 1000);
//         return;
//     }
    
//     applyFormOverride();
// });

// function applyFormOverride() {
//     console.log("✓ Applying s_website_form override");
    
//     publicWidget.registry.s_website_form.include({
//         send: async function (e) {
//             console.log("Custom send() method called");
//             e.preventDefault();

//             const $button = this.$target.find('.s_website_form_send, .o_website_form_send');
//             $button.addClass('disabled').attr('disabled', 'disabled');

//             const self = this;

//             // Validate form
//             if (!self.check_error_fields({})) {
//                 self.update_status('error', _t("Please fill in the form correctly."));
//                 $button.removeClass('disabled').removeAttr('disabled');
//                 return false;
//             }

//             // Prepare form data
//             this.form_fields = this.$target.serializeArray();
            
//             // Handle file inputs
//             $.each(this.$target.find('input[type=file]:not([disabled])'), (outer_index, input) => {
//                 $.each($(input).prop('files'), function (index, file) {
//                     self.form_fields.push({
//                         name: input.name + '[' + outer_index + '][' + index + ']',
//                         value: file
//                     });
//                 });
//             });

//             // Build form values object
//             var form_values = {};
//             _.each(this.form_fields, function (input) {
//                 if (input.name in form_values) {
//                     if (Array.isArray(form_values[input.name])) {
//                         form_values[input.name].push(input.value);
//                     } else {
//                         form_values[input.name] = [form_values[input.name], input.value];
//                     }
//                 } else {
//                     if (input.value !== '') {
//                         form_values[input.name] = input.value;
//                     }
//                 }
//             });

//             console.log("Submitting form with values:", form_values);

//             // Submit form
//             const action = this.$target.attr('action') + (this.$target.data('force_action') || this.$target.data('model_name'));
            
//             try {
//                 const result_data = await rpc(action, form_values);
//                 console.log("Form submission result:", result_data);

//                 // Restore button
//                 $button.removeClass('disabled').removeAttr('disabled');

//                 if (!result_data.id) {
//                     // Error
//                     self.update_status('error', result_data.error || false);
//                     if (result_data.error_fields) {
//                         self.check_error_fields(result_data.error_fields);
//                     }
//                 } else {
//                     // Success - CUSTOM: Check for thanks page redirect
//                     if (result_data.is_thanks_page) {
//                         console.log("Redirecting to /shop/order/thanks");
//                         window.location.href = '/shop/order/thanks';
//                         return;
//                     }

//                     // Handle other success modes
//                     let successMode = self.$target[0].dataset.successMode;
//                     let successPage = self.$target[0].dataset.successPage;
                    
//                     if (!successMode) {
//                         successPage = self.$target.attr('data-success_page');
//                         successMode = successPage ? 'redirect' : 'nothing';
//                     }

//                     if (successMode === 'redirect' && successPage) {
//                         console.log("Redirecting to:", successPage);
//                         window.location.href = successPage;
//                         return;
//                     } else if (successMode === 'message') {
//                         self.$target[0].classList.add('d-none');
//                         const endMsg = self.$target[0].parentElement?.querySelector('.s_website_form_end_message');
//                         if (endMsg) endMsg.classList.remove('d-none');
//                     } else {
//                         self.update_status('success');
//                     }

//                     // Reset form
//                     self.$target[0].reset();
//                 }
//             } catch (error) {
//                 console.error("Form submission error:", error);
//                 $button.removeClass('disabled').removeAttr('disabled');
                
//                 const errorMsg = error.status === 413 
//                     ? _t("Uploaded file is too large.") 
//                     : _t("An error occurred. Please try again.");
                
//                 self.update_status('error', errorMsg);
//             }
//         },
//     });
// }

// // import { _t } from "@web/core/l10n/translation";
// // import publicWidget from "@web/legacy/js/public/public_widget";
// // import { post } from "@web/core/network/http_service";
// // import { rpc } from "@web/core/network/rpc";

// // publicWidget.registry.s_website_form.include({
// //     /**
// //      * @override
// //      */
// //     send: async function (e) {
// //         e.preventDefault(); // Prevent the default submit behavior

// //         console.log("s_website_form send() called");

// //         // Prevent users from crazy clicking
// //         const $button = this.$target.find('.s_website_form_send, .o_website_form_send');
// //         $button.addClass('disabled').attr('disabled', 'disabled');

// //         // Add loading effect
// //         const buttonEl = $button[0];
// //         if (buttonEl) {
// //             buttonEl.classList.add('o_loading');
// //         }

// //         const self = this;

// //         self.$target.find('#s_website_form_result, #o_website_form_result').empty();

// //         // Validate form fields
// //         if (!self.check_error_fields({})) {
// //             self.update_status('error', _t("Please fill in the form correctly."));
// //             $button.removeClass('disabled').removeAttr('disabled');
// //             if (buttonEl) buttonEl.classList.remove('o_loading');
// //             return false;
// //         }

// //         // Prepare form inputs
// //         this.form_fields = this.$target.serializeArray();
        
// //         // Handle file inputs
// //         $.each(this.$target.find('input[type=file]:not([disabled])'), (outer_index, input) => {
// //             $.each($(input).prop('files'), function (index, file) {
// //                 self.form_fields.push({
// //                     name: input.name + '[' + outer_index + '][' + index + ']',
// //                     value: file
// //                 });
// //             });
// //         });

// //         // Serialize form inputs into a single object
// //         var form_values = {};
// //         _.each(this.form_fields, function (input) {
// //             if (input.name in form_values) {
// //                 // Handle x2many fields with arrays
// //                 if (Array.isArray(form_values[input.name])) {
// //                     form_values[input.name].push(input.value);
// //                 } else {
// //                     form_values[input.name] = [form_values[input.name], input.value];
// //                 }
// //             } else {
// //                 if (input.value !== '') {
// //                     form_values[input.name] = input.value;
// //                 }
// //             }
// //         });

// //         // Force server date format for date/datetime fields
// //         this.$target.find('.s_website_form_field:not(.s_website_form_custom)')
// //             .find('.s_website_form_date, .s_website_form_datetime').each(function () {
// //                 const inputEl = this.querySelector('input');

// //                 if (!inputEl || !inputEl.value) {
// //                     return;
// //                 }

// //                 // In v18, datetimepicker might be replaced with other date pickers
// //                 // Check if using Flatpickr or native date inputs
// //                 try {
// //                     const dateValue = new Date(inputEl.value);
// //                     if (!isNaN(dateValue)) {
// //                         let format = 'YYYY-MM-DD';
// //                         if ($(this).hasClass('s_website_form_datetime')) {
// //                             // Format as UTC datetime
// //                             const year = dateValue.getUTCFullYear();
// //                             const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
// //                             const day = String(dateValue.getUTCDate()).padStart(2, '0');
// //                             const hours = String(dateValue.getUTCHours()).padStart(2, '0');
// //                             const minutes = String(dateValue.getUTCMinutes()).padStart(2, '0');
// //                             const seconds = String(dateValue.getUTCSeconds()).padStart(2, '0');
// //                             form_values[inputEl.getAttribute('name')] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
// //                         } else {
// //                             // Format as date only
// //                             const year = dateValue.getFullYear();
// //                             const month = String(dateValue.getMonth() + 1).padStart(2, '0');
// //                             const day = String(dateValue.getDate()).padStart(2, '0');
// //                             form_values[inputEl.getAttribute('name')] = `${year}-${month}-${day}`;
// //                         }
// //                     }
// //                 } catch (err) {
// //                     console.warn("Date parsing error:", err);
// //                 }
// //             });

// //         // Handle reCAPTCHA if loaded
// //         if (this._recaptchaLoaded) {
// //             const tokenObj = await this._recaptcha.getToken('website_form');
// //             if (tokenObj.token) {
// //                 form_values['recaptcha_token_response'] = tokenObj.token;
// //             } else if (tokenObj.error) {
// //                 self.update_status('error', tokenObj.error);
// //                 $button.removeClass('disabled').removeAttr('disabled');
// //                 if (buttonEl) buttonEl.classList.remove('o_loading');
// //                 return false;
// //             }
// //         }

// //         console.log("Form values prepared:", form_values);

// //         // Post form and handle result
// //         const action = this.$target.attr('action') + (this.$target.data('force_action') || this.$target.data('model_name'));
        
// //         try {
// //             console.log("Posting to:", action);
            
// //             // Use RPC for form submission in v18
// //             const result_data = await rpc(action, form_values);
            
// //             console.log("Form submission result:", result_data);

// //             // Restore send button
// //             $button.removeClass('disabled').removeAttr('disabled');
// //             if (buttonEl) buttonEl.classList.remove('o_loading');

// //             if (!result_data.id) {
// //                 // Failure - server didn't return created record ID
// //                 self.update_status('error', result_data.error ? result_data.error : false);
// //                 if (result_data.error_fields) {
// //                     self.check_error_fields(result_data.error_fields);
// //                 }
// //             } else {
// //                 // Success
// //                 let successMode = self.$target[0].dataset.successMode;
// //                 let successPage = self.$target[0].dataset.successPage;
                
// //                 if (!successMode) {
// //                     successPage = self.$target.attr('data-success_page'); // Compatibility
// //                     successMode = successPage ? 'redirect' : 'nothing';
// //                 }

// //                 // CUSTOM: Check for thanks page redirect
// //                 if (result_data.is_thanks_page) {
// //                     console.log("Redirecting to thanks page");
// //                     window.location.href = '/shop/order/thanks';
// //                     return;
// //                 }

// //                 switch (successMode) {
// //                     case 'redirect': {
// //                         let hashIndex = successPage.indexOf("#");
// //                         if (hashIndex > 0) {
// //                             // Handle anchor URLs
// //                             let currentUrlPath = window.location.pathname;
// //                             if (!currentUrlPath.endsWith("/")) {
// //                                 currentUrlPath = currentUrlPath + "/";
// //                             }
// //                             if (!successPage.includes("/#")) {
// //                                 successPage = successPage.replace("#", "/#");
// //                                 hashIndex++;
// //                             }
                            
// //                             // Check if anchor is on current page
// //                             const langCode = document.documentElement.lang || 'en';
// //                             if ([successPage, "/" + langCode + successPage].some(link => link.startsWith(currentUrlPath + '#'))) {
// //                                 successPage = successPage.substring(hashIndex);
// //                             }
// //                         }
                        
// //                         if (successPage.charAt(0) === "#") {
// //                             // Scroll to anchor on same page
// //                             const successAnchorEl = document.getElementById(successPage.substring(1));
// //                             if (successAnchorEl) {
// //                                 successAnchorEl.scrollIntoView({
// //                                     behavior: 'smooth',
// //                                     block: 'start'
// //                                 });
// //                             }
// //                             break;
// //                         }
                        
// //                         // Redirect to different page
// //                         window.location.href = successPage;
// //                         return;
// //                     }
                    
// //                     case 'message': {
// //                         // Show success message
// //                         await new Promise(resolve => setTimeout(resolve, 300)); // Small delay
                        
// //                         self.$target[0].classList.add('d-none');
// //                         const endMessage = self.$target[0].parentElement.querySelector('.s_website_form_end_message');
// //                         if (endMessage) {
// //                             endMessage.classList.remove('d-none');
// //                         }
// //                         break;
// //                     }
                    
// //                     default: {
// //                         // Show default success status
// //                         await new Promise(resolve => setTimeout(resolve, 300)); // Small delay
// //                         self.update_status('success');
// //                         break;
// //                     }
// //                 }

// //                 // Reset form
// //                 self.$target[0].reset();
// //             }
// //         } catch (error) {
// //             console.error("Form submission error:", error);
            
// //             // Restore button state
// //             $button.removeClass('disabled').removeAttr('disabled');
// //             if (buttonEl) buttonEl.classList.remove('o_loading');
            
// //             // Show error message
// //             const errorMsg = error.status && error.status === 413 
// //                 ? _t("Uploaded file is too large.") 
// //                 : _t("An error occurred. Please try again.");
            
// //             self.update_status('error', errorMsg);
// //         }
// //     },
// // });


// // // odoo.define('bluespace_custom_16.s_website_form', ['website.s_website_form', 'web.public.widget', 'web.core', 'web.dom', 'web.ajax', 'web.concurrency', 'web.session'], function (require) {
// // //   'use strict';

// // //   var core = require('web.core');
// // //   var publicWidget = require('web.public.widget');
// // //   const dom = require('web.dom');
// // //   var ajax = require('web.ajax');
// // //   const concurrency = require('web.concurrency');
// // //   const session = require('web.session');

// // //   var _t = core._t;
// // //   var qweb = core.qweb;

// // //   publicWidget.registry.s_website_form.include({
// // //     send: async function (e) {
// // //             e.preventDefault(); // Prevent the default submit behavior
// // //              // Prevent users from crazy clicking
// // //             const $button = this.$target.find('.s_website_form_send, .o_website_form_send');
// // //             $button.addClass('disabled') // !compatibility
// // //                    .attr('disabled', 'disabled');
// // //             this.restoreBtnLoading = dom.addButtonLoadingEffect($button[0]);

// // //             var self = this;

// // //             self.$target.find('#s_website_form_result, #o_website_form_result').empty(); // !compatibility
// // //             if (!self.check_error_fields({})) {
// // //                 self.update_status('error', _t("Please fill in the form correctly."));
// // //                 return false;
// // //             }

// // //             // Prepare form inputs
// // //             this.form_fields = this.$target.serializeArray();
// // //             $.each(this.$target.find('input[type=file]:not([disabled])'), (outer_index, input) => {
// // //                 $.each($(input).prop('files'), function (index, file) {
// // //                     // Index field name as ajax won't accept arrays of files
// // //                     // when aggregating multiple files into a single field value
// // //                     self.form_fields.push({
// // //                         name: input.name + '[' + outer_index + '][' + index + ']',
// // //                         value: file
// // //                     });
// // //                 });
// // //             });

// // //             // Serialize form inputs into a single object
// // //             // Aggregate multiple values into arrays
// // //             var form_values = {};
// // //             _.each(this.form_fields, function (input) {
// // //                 if (input.name in form_values) {
// // //                     // If a value already exists for this field,
// // //                     // we are facing a x2many field, so we store
// // //                     // the values in an array.
// // //                     if (Array.isArray(form_values[input.name])) {
// // //                         form_values[input.name].push(input.value);
// // //                     } else {
// // //                         form_values[input.name] = [form_values[input.name], input.value];
// // //                     }
// // //                 } else {
// // //                     if (input.value !== '') {
// // //                         form_values[input.name] = input.value;
// // //                     }
// // //                 }
// // //             });

// // //             // force server date format usage for existing fields
// // //             this.$target.find('.s_website_form_field:not(.s_website_form_custom)')
// // //             .find('.s_website_form_date, .s_website_form_datetime').each(function () {
// // //                 const inputEl = this.querySelector('input');

// // //                 // Datetimepicker('viewDate') will return `new Date()` if the
// // //                 // input is empty but we want to keep the empty value
// // //                 if (!inputEl.value) {
// // //                     return;
// // //                 }

// // //                 var date = $(this).datetimepicker('viewDate').clone().locale('en');
// // //                 var format = 'YYYY-MM-DD';
// // //                 if ($(this).hasClass('s_website_form_datetime')) {
// // //                     date = date.utc();
// // //                     format = 'YYYY-MM-DD HH:mm:ss';
// // //                 }
// // //                 form_values[inputEl.getAttribute('name')] = date.format(format);
// // //             });

// // //             if (this._recaptchaLoaded) {
// // //                 const tokenObj = await this._recaptcha.getToken('website_form');
// // //                 if (tokenObj.token) {
// // //                     form_values['recaptcha_token_response'] = tokenObj.token;
// // //                 } else if (tokenObj.error) {
// // //                     self.update_status('error', tokenObj.error);
// // //                     return false;
// // //                 }
// // //             }

// // //             // Post form and handle result
// // //             ajax.post(this.$target.attr('action') + (this.$target.data('force_action') || this.$target.data('model_name')), form_values)
// // //             .then(async function (result_data) {
// // //                 // Restore send button behavior
// // //                 self.$target.find('.s_website_form_send, .o_website_form_send')
// // //                     .removeAttr('disabled')
// // //                     .removeClass('disabled'); // !compatibility
// // //                 result_data = JSON.parse(result_data);
// // //                 if (!result_data.id) {
// // //                     // Failure, the server didn't return the created record ID
// // //                     self.update_status('error', result_data.error ? result_data.error : false);
// // //                     if (result_data.error_fields) {
// // //                         // If the server return a list of bad fields, show these fields for users
// // //                         self.check_error_fields(result_data.error_fields);
// // //                     }
// // //                 } else {
// // //                     // Success, redirect or update status
// // //                     let successMode = self.$target[0].dataset.successMode;
// // //                     let successPage = self.$target[0].dataset.successPage;
// // //                     if (!successMode) {
// // //                         successPage = self.$target.attr('data-success_page'); // Compatibility
// // //                         successMode = successPage ? 'redirect' : 'nothing';
// // //                     }
// // //                     //Added by Nikita
// // //                     if (result_data.is_thanks_page) {
// // //                         console.log("HELLLOOOOOOOO BROOOOOOOOOOOO")
// // //                         $(window.location).attr('href', '/shop/order/thanks');
// // //                         return;
// // //                     }
// // //                     switch (successMode) {
// // //                         case 'redirect': {
// // //                             let hashIndex = successPage.indexOf("#");
// // //                             if (hashIndex > 0) {
// // //                                 // URL containing an anchor detected: extract
// // //                                 // the anchor from the URL if the URL is the
// // //                                 // same as the current page URL so we can scroll
// // //                                 // directly to the element (if found) later
// // //                                 // instead of redirecting.
// // //                                 // Note that both currentUrlPath and successPage
// // //                                 // can exist with or without a trailing slash
// // //                                 // before the hash (e.g. "domain.com#footer" or
// // //                                 // "domain.com/#footer"). Therefore, if they are
// // //                                 // not present, we add them to be able to
// // //                                 // compare the two variables correctly.
// // //                                 let currentUrlPath = window.location.pathname;
// // //                                 if (!currentUrlPath.endsWith("/")) {
// // //                                     currentUrlPath = currentUrlPath + "/";
// // //                                 }
// // //                                 if (!successPage.includes("/#")) {
// // //                                     successPage = successPage.replace("#", "/#");
// // //                                     hashIndex++;
// // //                                 }
// // //                                 if ([successPage, "/" + session.lang_url_code + successPage].some(link => link.startsWith(currentUrlPath + '#'))) {
// // //                                     successPage = successPage.substring(hashIndex);
// // //                                 }
// // //                             }
// // //                             if (successPage.charAt(0) === "#") {
// // //                                 const successAnchorEl = document.getElementById(successPage.substring(1));
// // //                                 if (successAnchorEl) {
// // //                                     await dom.scrollTo(successAnchorEl, {
// // //                                         duration: 500,
// // //                                         extraOffset: 0,
// // //                                     });
// // //                                 }
// // //                                 break;
// // //                             }
// // //                             $(window.location).attr('href', successPage);
// // //                             return;
// // //                         }
// // //                         case 'message': {
// // //                             // Prevent double-clicking on the send button and
// // //                             // add a upload loading effect (delay before success
// // //                             // message)
// // //                             await concurrency.delay(dom.DEBOUNCE);

// // //                             self.$target[0].classList.add('d-none');
// // //                             self.$target[0].parentElement.querySelector('.s_website_form_end_message').classList.remove('d-none');
// // //                             break;
// // //                         }
// // //                         default: {
// // //                             // Prevent double-clicking on the send button and
// // //                             // add a upload loading effect (delay before success
// // //                             // message)
// // //                             await concurrency.delay(dom.DEBOUNCE);

// // //                             self.update_status('success');
// // //                             break;
// // //                         }
// // //                     }

// // //                     self.$target[0].reset();
// // //                     self.restoreBtnLoading();
// // //                 }
// // //             })
// // //             .guardedCatch(error => {
// // //                 this.update_status(
// // //                     'error',
// // //                     error.status && error.status === 413 ? _t("Uploaded file is too large.") : "",
// // //                 );
// // //             });
// // //         },
// // //   });
// // // });
