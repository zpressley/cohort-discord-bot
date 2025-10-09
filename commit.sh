#!/bin/bash

# Ask for commit message
echo "Enter commit message:"
read message

# Run git commands
git add . && git commit -m "$message" && git push origin main