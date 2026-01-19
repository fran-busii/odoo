// /** @odoo-module **/

// console.log("============ DATE VALIDATION MODULE LOADING ============");

// import { WebsiteSale } from '@website_sale/js/website_sale';
// import { patch } from "@web/core/utils/patch";

// console.log("============ WebsiteSale imported:", WebsiteSale);

// WebsiteSale.include({
//     events: Object.assign({}, WebsiteSale.prototype.events, {
//         'click .account-submit': '_onClickAccountSubmit',
//     }),
//     /**
//      * Toggles the add to cart button depending on the possibility of the
//      * current combination.
//      *
//      * @override
//      */
//     _submitForm: function () {
//         const params = this.rootProduct;
//         const $product = $('#product_detail');
//         const productTrackingInfo = $product.data('product-tracking-info');
//         if (productTrackingInfo) {
//             productTrackingInfo.quantity = params.quantity;
//             $product.trigger('add_to_cart_event', [productTrackingInfo]);
//         }

//         params.add_qty = params.quantity;
//         const move_in_date = $('#MoveInDate').val();
//         const move_out_date = $('#MoveOutDate').val();
//         console.log("MOVEEEEEEEEEE OUTTTTTTTTT", move_in_date)
//         const is_move_out_date = $('input[name="is_no_move_out_date"]').is(':checked');
//         const flexible_move_out = $('input[name="is_move_out_date"]').is(':checked');
//         const no_of_visitors = $('input[name="ofc_person"]').val();
//         /*#const is_move_out_date = $('.is_no_move_out_date').val();*/
//         console.log("MOVEEEEEEEEEE", is_move_out_date)
//         params.product_custom_attribute_values = JSON.stringify(params.product_custom_attribute_values);
//         params.no_variant_attribute_values = JSON.stringify(params.no_variant_attribute_values);
//         params.move_in_date = move_in_date;
//         params.move_out_date = move_out_date;
//         params.is_move_out_date = is_move_out_date
//         params.flexible_move_out = flexible_move_out
//         params.no_of_visitors = no_of_visitors
//         console.log("HELLOOOOOOOO", params)
//         delete params.quantity;
//         return this.addToCart(params);
//     },

//     _onClickAccountSubmit: function (ev, forceSubmit) {
//         console.log("_onClickAccountSubmit>>>>>>>>>>>>>>>>>>>")
//         if ($(ev.currentTarget).is('#add_to_cart, #products_grid .account-submit') && !forceSubmit) {
//             return;
//         }
//         var $aSubmit = $(ev.currentTarget);
//         if (!ev.isDefaultPrevented() && !$aSubmit.is(".disabled")) {
//             ev.preventDefault();
//             $aSubmit.closest('form').submit();
//         }
//         if ($aSubmit.hasClass('a-submit-disable')) {
//             $aSubmit.addClass("disabled");
//         }
//         if ($aSubmit.hasClass('a-submit-loading')) {
//             var loading = '<span class="fa fa-cog fa-spin"/>';
//             var fa_span = $aSubmit.find('span[class*="fa"]');
//             if (fa_span.length) {
//                 fa_span.replaceWith(loading);
//             } else {
//                 $aSubmit.append(loading);
//             }
//         }
//     },
// });

/** @odoo-module **/
import { WebsiteSale } from '@website_sale/js/website_sale';
import VariantMixin from "@website_sale_renting/js/variant_mixin";

console.log("============ DATE VALIDATION MODULE LOADING ============");

WebsiteSale.include({
    /**
     * Override _handleAdd to include move-in/move-out dates
     * 
     * @override
     */
    _handleAdd: function ($form) {
        console.log("============ _handleAdd CALLED ============");
        console.log("Form:", $form);
        
        var self = this;
        this.$form = $form;
        
        var productSelector = [
            'input[type="hidden"][name="product_id"]',
            'input[type="radio"][name="product_id"]:checked'
        ];
        
        var productReady = this.selectOrCreateProduct(
            $form,
            parseInt($form.find(productSelector.join(', ')).first().val(), 10),
            $form.find('.product_template_id').val(),
            false
        );
        
        return productReady.then(function (productId) {
            $form.find(productSelector.join(', ')).val(productId);
            var product_template_id = parseInt($form.find('.product_template_id').val());

            var ptav_ids = [];
            $form.find('input.js_variant_change:checked, select.js_variant_change').each(function() {
                var $el = $(this);
                if ($el.is('input[type="radio"]') || $el.is('input[type="checkbox"]')) {
                    ptav_ids.push(parseInt($el.val()));
                } else if ($el.is('select')) {
                    ptav_ids.push(parseInt($el.val()));
                }
            });
            
            // Get all the date and rental values
            var move_in_date = $('#MoveInDate').val();
            var move_out_date = $('#MoveOutDate').val();
            var is_move_out_date = $('input[name="is_no_move_out_date"]').is(':checked');
            var flexible_move_out = $('input[name="is_move_out_date"]').is(':checked');
            var no_of_visitors = $('input[name="ofc_person"]').val();
            var renting_dates = $('input[name="renting_dates"]').val();
            
            console.log("============ CAPTURED VALUES ============");
            console.log("Move In Date:", move_in_date);
            console.log("Move Out Date:", move_out_date);
            console.log("Product Template ID:", product_template_id);
            console.log("PTAV IDs:", ptav_ids);
            console.log("Is Specific Move Out:", is_move_out_date);
            console.log("Is Flexible Move Out:", flexible_move_out);
            console.log("Number of Visitors:", no_of_visitors);
            console.log("Renting Dates:", renting_dates);
            
            // Validate move-in date
            if (!move_in_date) {
                alert("Please select a Move-In Date before adding to cart.");
                return Promise.reject("Move-in date is required");
            }
            
            // Build rootProduct with all values
            self.rootProduct = {
                product_id: productId,
                product_template_id: product_template_id,
                ptav_ids: ptav_ids, 
                quantity: parseFloat($form.find('input[name="add_qty"]').val() || 1),
                product_custom_attribute_values: self.getCustomVariantValues($form.find('.js_product')),
                variant_values: self.getSelectedVariantValues($form.find('.js_product')),
                no_variant_attribute_values: self.getNoVariantAttributeValues($form.find('.js_product')),
                move_in_date: move_in_date,
                move_out_date: move_out_date,
                is_move_out_date: is_move_out_date,
                flexible_move_out: flexible_move_out,
                no_of_visitors: no_of_visitors,
                renting_dates: renting_dates,
            };
            
            console.log("============ ROOT PRODUCT ============", self.rootProduct);
            
            return self._onProductReady();
        });
    }
});

console.log("============ DATE VALIDATION MODULE LOADED ============");