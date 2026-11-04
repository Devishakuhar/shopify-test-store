
(() => {
  if (window.customFeaturedProductInitialized) return;
  window.customFeaturedProductInitialized = true;

  // Get product and variant data
  const getVariant = (card) => {
    const data = JSON.parse(
      card.querySelector('[data-product-json]').textContent
    );

    return {
      data,
      options: data.options
    };
  };

  // Get currently selected options
  const getSelectedOptions = (card, options) => {
    return options.map((_, index) => {
      const position = index + 1;

      const selectedButton = card.querySelector(
        `[data-option-position="${position}"][data-option-value][aria-pressed="true"]`
      );

      return selectedButton
        ? selectedButton.dataset.optionValue
        : null;
    });
  };

  // Format Shopify money
  const formatMoney = (amount, currency) => {
    return new Intl.NumberFormat(
      document.documentElement.lang || 'en-IN',
      {
        style: 'currency',
        currency: currency || 'INR'
      }
    ).format(amount / 100);
  };

  // Update product card
  const updateCard = (card) => {
    const { data, options } = getVariant(card);
    const selectedOptions = getSelectedOptions(card, options);

    const variant = data.variants.find(item =>
      item.options.every(
        (value, index) => value === selectedOptions[index]
      )
    );

    const button = card.querySelector('[data-add-to-cart]');
    const buttonText = card.querySelector('[data-button-text]');
    const availability = card.querySelector('[data-availability]');
    const image = card.querySelector('[data-product-image]');
    const badge = card.querySelector('[data-discount-badge]');
    const sellingPrice = card.querySelector('[data-selling-price]');
    const comparePrice = card.querySelector('[data-compare-price]');
    const currency = card.dataset.currency;
    const links = card.querySelectorAll('[data-product-link]');

    // Nonexistent combination
    if (!variant) {
      button.disabled = true;
      button.dataset.variantId = '';
      buttonText.textContent = 'Unavailable';

      availability.textContent =
        'This combination is unavailable.';

      sellingPrice.textContent = '—';
      comparePrice.hidden = true;
      badge.hidden = true;

      return;
    }

    // Update variant ID and availability
    button.dataset.variantId = variant.id;
    button.disabled = !variant.available;

    buttonText.textContent = variant.available
      ? 'Add to Cart'
      : 'Sold Out';

    availability.textContent = variant.available
      ? ''
      : 'This variant is sold out.';

    // Update selling price
    sellingPrice.textContent = formatMoney(
      variant.price,
      currency
    );

    // Update compare-at price and discount
    if (
      variant.compare_at_price &&
      variant.compare_at_price > variant.price
    ) {
      comparePrice.hidden = false;

      comparePrice.textContent = formatMoney(
        variant.compare_at_price,
        currency
      );

      const discount = Math.round(
        ((variant.compare_at_price - variant.price) /
          variant.compare_at_price) * 100
      );

      badge.hidden = false;
      badge.textContent = `${discount}% OFF`;

    } else {
      comparePrice.hidden = true;
      badge.hidden = true;
    }

    // Update product image
    if (variant.featured_image?.src && image) {
      image.src = variant.featured_image.src;
      image.srcset = '';
    }

    // Update selected variant in product links
    links.forEach(link => {
      const url = new URL(link.href, window.location.origin);
      url.searchParams.set('variant', variant.id);
      link.href = url.toString();
    });
  };

  // Handle color and size button selection
  document.addEventListener('click', event => {
    const optionButton = event.target.closest(
      '[data-product-card] button[data-option-position][data-option-value]'
    );

    if (!optionButton) return;

    event.preventDefault();

    const card = optionButton.closest('[data-product-card]');
    const position = optionButton.dataset.optionPosition;

    // Update selected state only for the current option group
    card.querySelectorAll(
      `button[data-option-position="${position}"][data-option-value]`
    ).forEach(item => {
      item.setAttribute(
        'aria-pressed',
        String(item === optionButton)
      );
    });

    // Update prices, image, availability and variant
    updateCard(card);
  });

  // Ajax Add to Cart
  document.addEventListener('click', async event => {
    const button = event.target.closest(
      '[data-product-card] [data-add-to-cart]'
    );

    if (!button || button.disabled) return;

    const card = button.closest('[data-product-card]');
    const feedback = card.querySelector('[data-cart-feedback]');
    const buttonText = card.querySelector('[data-button-text]');

    if (button.dataset.pending === 'true') return;

    const variantId = Number(button.dataset.variantId);

    if (!variantId) return;

    const originalText = 'Add to Cart';

    button.dataset.pending = 'true';
    button.disabled = true;
    buttonText.textContent = 'Adding...';
    feedback.textContent = '';

    try {
      const response = await fetch(
        window.Shopify.routes.root + 'cart/add.js',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: 1
            }]
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.description || 'Unable to add product.'
        );
      }

      feedback.textContent = 'Successfully added to cart!';
      buttonText.textContent = 'Added!';

      // Notify other theme components if needed
      document.dispatchEvent(
        new CustomEvent('cart:updated', {
          bubbles: true,
          detail: { variantId, result }
        })
      );

    } catch (error) {
      feedback.textContent = error.message;
      buttonText.textContent = 'Try Again';

    } finally {
      button.dataset.pending = 'false';

      // Recheck the currently selected variant
      const currentVariantId = Number(button.dataset.variantId);

      const { data } = getVariant(card);

      const currentVariant = data.variants.find(
        variant => variant.id === currentVariantId
      );

      button.disabled = !currentVariant || !currentVariant.available;

      if (!currentVariant) {
        buttonText.textContent = 'Unavailable';
      } else if (!currentVariant.available) {
        buttonText.textContent = 'Sold Out';
      } else if (feedback.textContent.includes('Successfully')) {
        buttonText.textContent = 'Added!';
      } else {
        buttonText.textContent = originalText;
      }
    }
  });

  // Initialize cards
  const initializeCards = (container = document) => {
    container.querySelectorAll('[data-product-card]').forEach(card => {
      updateCard(card);
    });
  };

  // Initial page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeCards();
    });
  } else {
    initializeCards();
  }

  // Shopify theme editor section reload
  document.addEventListener('shopify:section:load', event => {
    initializeCards(event.target);
  });

})();
