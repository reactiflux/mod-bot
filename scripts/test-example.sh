#!/bin/bash

# Example usage of the payment flow test script
# Update the cookie values below with current session data

export COOKIE_SESSION="__client-session=eyJ1c2VySWQiOiI4NWFlMjg3ZS00ODg5LTRlYTItYTNkMy05NmQ2N2ZhYmVlNzAifQ%3D%3D.eCrKG%2B8z%2BqGdZtvYt7ckQcXCldSi3YeMHrlR6aRQaoI"
export DB_SESSION="__session=IjRlNGQ1OTE2LTIyNTItNDRlOS1iNTUxLThkZThlMTRkNjhhNiI%3D"

# Run the payment flow tests
./scripts/test-payment-flow.sh