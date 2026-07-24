<?php
/**
 * Plugin bootstrap.
 *
 * @package Posta_WooCommerce
 */

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class.
 */
final class Posta_WC_Plugin {

	/**
	 * Singleton.
	 *
	 * @var Posta_WC_Plugin|null
	 */
	private static $instance = null;

	/**
	 * @var Posta_WC_Admin|null
	 */
	public $admin = null;

	/**
	 * @return Posta_WC_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Init hooks.
	 */
	public function init() {
		load_plugin_textdomain( 'posta-woocommerce', false, dirname( plugin_basename( POSTA_WC_PLUGIN_FILE ) ) . '/languages' );

		if ( ! $this->is_woocommerce_active() ) {
			add_action( 'admin_notices', array( $this, 'notice_missing_woocommerce' ) );
			return;
		}

		if ( is_admin() ) {
			$this->admin = new Posta_WC_Admin();
			$this->admin->hooks();
		}
	}

	/**
	 * @return bool
	 */
	public function is_woocommerce_active() {
		return class_exists( 'WooCommerce' );
	}

	/**
	 * Admin notice when WooCommerce is missing.
	 */
	public function notice_missing_woocommerce() {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		echo '<div class="notice notice-error"><p>';
		echo esc_html__( 'Posta para WooCommerce requiere WooCommerce activo.', 'posta-woocommerce' );
		echo '</p></div>';
	}

	/**
	 * Activation.
	 */
	public static function activate() {
		if ( ! get_option( 'posta_wc_settings' ) ) {
			update_option(
				'posta_wc_settings',
				array(
					'api_url' => POSTA_WC_DEFAULT_API_URL,
				)
			);
		}
	}

	/**
	 * Deactivation — no destruye la conexión (solo al desinstalar).
	 */
	public static function deactivate() {
		// Intentionally empty.
	}
}
