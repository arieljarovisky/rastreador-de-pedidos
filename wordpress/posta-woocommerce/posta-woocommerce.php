<?php
/**
 * Plugin Name:       Posta para WooCommerce
 * Plugin URI:        https://www.enviosposta.com.ar
 * Description:       Conectá tu tienda WooCommerce con Posta para sincronizar pedidos con envío a domicilio.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Posta
 * Author URI:        https://www.enviosposta.com.ar
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       posta-woocommerce
 * Domain Path:       /languages
 * WC requires at least: 7.0
 * WC tested up to:   9.0
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

define( 'POSTA_WC_VERSION', '1.0.0' );
define( 'POSTA_WC_PLUGIN_FILE', __FILE__ );
define( 'POSTA_WC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'POSTA_WC_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'POSTA_WC_DEFAULT_API_URL', 'https://envios-erp.up.railway.app' );

require_once POSTA_WC_PLUGIN_DIR . 'includes/class-posta-api-client.php';
require_once POSTA_WC_PLUGIN_DIR . 'includes/class-posta-api-keys.php';
require_once POSTA_WC_PLUGIN_DIR . 'includes/class-posta-connector.php';
require_once POSTA_WC_PLUGIN_DIR . 'includes/class-posta-admin.php';
require_once POSTA_WC_PLUGIN_DIR . 'includes/class-posta-plugin.php';

/**
 * Bootstrap.
 */
function posta_wc(): Posta_WC_Plugin {
	return Posta_WC_Plugin::instance();
}

add_action( 'plugins_loaded', static function () {
	posta_wc()->init();
} );

register_activation_hook( __FILE__, array( 'Posta_WC_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Posta_WC_Plugin', 'deactivate' ) );
