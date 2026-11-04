
(() => {
  if (window.customFeaturedProductInitialized) return;
  window.customFeaturedProductInitialized = true;

  const getVariant = (card) => {
    const data = JSON.parse(
      card.querySelector('[data-product-json]').textContent
    );

    const initialId = Number(card.dataset.initialVariant);

    const initialVariant = data.variants.find(
      variant => variant.id === initialId
    );

    const options = [...data.options];

    return { data, initialVariant, options };
  };

  const getSelectedOptions = (card, options) => {
    return options.map((_, index) => {
      const position = index + 1;

      const swatch = card.querySelector(
        `[data-option-position="${position}"][data-option-value][aria-pressed="true"]`
      );

      const select = card.querySelector(
        `select[data-option-position="${position}"]`
      );

      return swatch
        ? swatch.dataset.optionValue
        : select?.value;
    });
  };

  const formatMoney = (amount, currency) => {
    return new Intl.NumberFormat(
      document.documentElement.lang || 'en-IN',
      {
        style: 'currency',
        currency: currency || 'INR'
      }
    ).format(amount / 100);
  };

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

    if (!variant) {
      button.disabled = true;
      buttonText.textContent = 'Unavailable';
      availability.textContent = 'This combination is unavailable.';
      return;
    }

    button.dataset.variantId = variant.id;
    button.disabled = !variant.available;

    buttonText.textContent = variant.available
      ? 'Add to Cart'
      : 'Sold Out';

    availability.textContent = variant.available
      ? ''
      : 'This variant is sold out.';

    sellingPrice.textContent = formatMoney(
      variant.price,
      currency
    );

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

    // Update variant image
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

  // Color swatch selection
  document.addEventListener('click', event => {
    const swatch = event.target.closest(
      '[data-product-card] [data-option-value]'
    );

    if (!swatch) return;

    event.preventDefault();

    const card = swatch.closest('[data-product-card]');
    const position = swatch.dataset.optionPosition;
    const value = swatch.dataset.optionValue;

    card.querySelectorAll(
      `[data-option-position="${position}"][data-option-value]`
    ).forEach(item => {
      item.setAttribute(
        'aria-pressed',
        String(item === swatch)
      );
    });

    updateCard(card);
  });

  // Size and other option selection
  document.addEventListener('change', event => {
    const select = event.target.closest(
      '[data-product-card] select[data-product-option]'
    );

    if (!select) return;

    updateCard(select.closest('[data-product-card]'));
  });

  // Ajax add to cart
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

    } catch (error) {
      feedback.textContent = error.message;
      buttonText.textContent = 'Try Again';

    } finally {
      button.dataset.pending = 'false';
      button.disabled = false;
    }
  });

  // Shopify theme editor section reload support
  document.addEventListener('shopify:section:load', event => {
    event.target.querySelectorAll('[data-product-card]').forEach(card => {
      updateCard(card);
    });
  });

})();
